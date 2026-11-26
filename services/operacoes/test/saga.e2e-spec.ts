import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';
import { Channel, ChannelModel, ConsumeMessage, connect } from 'amqplib';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';

import { configurarApp } from '@ioc/configurar-app';

const VHOST = 'pluvia';
const CENTRO = '6f1c2a10-0000-4000-8000-000000000001';
const EQUIPE = '8a2b3c40-0000-4000-8000-000000000001';
const CAMINHAO = '9b3c4d50-0000-4000-8000-000000000001';
const FILAS = ['equipes.comandos', 'frota.comandos', 'operacoes.respostas', 'notificacoes.eventos'];

interface Definicoes {
  exchanges: { name: string; type: string; durable: boolean }[];
  queues: { name: string; durable: boolean }[];
  bindings: { source: string; destination: string; routing_key: string }[];
}

interface Mensagem {
  id: string;
  tipo: string;
  correlationId: string;
  causationId: string | null;
  dados: Record<string, unknown>;
}

/** Cria no broker de teste a topologia do infra/rabbitmq/definitions.json usada pela SAGA. */
async function criarTopologia(canal: Channel): Promise<void> {
  const caminho = join(__dirname, '..', '..', '..', 'infra', 'rabbitmq', 'definitions.json');
  const definicoes: Definicoes = JSON.parse(readFileSync(caminho, 'utf8'));
  for (const e of definicoes.exchanges) await canal.assertExchange(e.name, e.type, { durable: e.durable });
  for (const q of definicoes.queues.filter((q) => FILAS.includes(q.name))) {
    await canal.assertQueue(q.name, { durable: q.durable });
  }
  for (const b of definicoes.bindings.filter((b) => FILAS.includes(b.destination))) {
    await canal.bindQueue(b.destination, b.source, b.routing_key);
  }
}

type Politica = (comando: Mensagem) => { tipo: string; dados: Record<string, unknown> } | null;

/**
 * Faz o papel de Equipes ou de Frota: lê os comandos que chegam na fila do
 * participante e responde em operacoes.respostas conforme a política do teste.
 */
class ParticipanteDeTeste {
  readonly recebidos: Mensagem[] = [];
  politica: Politica = () => null;

  constructor(private readonly canal: Channel, private readonly fila: string, private readonly origem: string) {}

  async iniciar(): Promise<void> {
    await this.canal.consume(this.fila, (msg: ConsumeMessage | null) => {
      if (!msg) return;
      const comando: Mensagem = JSON.parse(msg.content.toString('utf8'));
      this.recebidos.push(comando);
      const resposta = this.politica(comando);
      if (resposta) {
        const envelope = {
          id: randomUUID(),
          tipo: resposta.tipo,
          versao: 1,
          origem: this.origem,
          ocorridoEm: new Date().toISOString(),
          correlationId: comando.correlationId,
          causationId: comando.id,
          dados: { sagaId: comando.dados.sagaId, ...resposta.dados },
        };
        this.canal.publish('pluvia.comandos', 'operacoes.respostas', Buffer.from(JSON.stringify(envelope)));
      }
      this.canal.ack(msg);
    });
  }

  daSaga(sagaId: string): string[] {
    return this.recebidos.filter((m) => m.dados.sagaId === sagaId).map((m) => m.tipo);
  }
}

/** Pergunta de novo a cada 200 ms, até a condição valer ou o tempo acabar. */
async function esperarAte<T>(consulta: () => Promise<T>, condicao: (v: T) => boolean, limiteMs = 15000): Promise<T> {
  const limite = Date.now() + limiteMs;
  for (;;) {
    const valor = await consulta();
    if (condicao(valor) || Date.now() > limite) return valor;
    await new Promise((r) => setTimeout(r, 200));
  }
}

function amanha(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * A SAGA de abertura de ação de ponta a ponta no lado do orquestrador: HTTP,
 * banco, outbox, RabbitMQ e o consumidor de respostas, com Equipes e Frota
 * respondendo pela fila.
 */
describe('SAGA de abertura de ação (e2e)', () => {
  let banco: StartedPostgreSqlContainer;
  let rabbit: StartedRabbitMQContainer;
  let conexao: ChannelModel;
  let app: INestApplication;
  let equipes: ParticipanteDeTeste;
  let frota: ParticipanteDeTeste;
  let eventos: Mensagem[];

  beforeAll(async () => {
    [banco, rabbit] = await Promise.all([
      new PostgreSqlContainer('postgres:17-alpine').start(),
      new RabbitMQContainer('rabbitmq:4.1-management-alpine')
        .withEnvironment({ RABBITMQ_DEFAULT_VHOST: VHOST })
        .start(),
    ]);
    conexao = await connect(`${rabbit.getAmqpUrl()}/${VHOST}`);
    const canal = await conexao.createChannel();
    await criarTopologia(canal);

    equipes = new ParticipanteDeTeste(canal, 'equipes.comandos', 'equipes');
    frota = new ParticipanteDeTeste(canal, 'frota.comandos', 'frota');
    await equipes.iniciar();
    await frota.iniciar();
    eventos = [];
    await canal.consume('notificacoes.eventos', (msg) => {
      if (!msg) return;
      eventos.push(JSON.parse(msg.content.toString('utf8')));
      canal.ack(msg);
    });

    process.env.POSTGRES_HOST = banco.getHost();
    process.env.POSTGRES_PORT = String(banco.getPort());
    process.env.POSTGRES_DB = banco.getDatabase();
    process.env.POSTGRES_USER = banco.getUsername();
    process.env.POSTGRES_PASSWORD = banco.getPassword();
    process.env.RABBITMQ_HOST = rabbit.getHost();
    process.env.RABBITMQ_PORT = String(rabbit.getMappedPort(5672));
    process.env.RABBITMQ_VHOST = VHOST;
    process.env.RABBITMQ_USER = 'guest';
    process.env.RABBITMQ_PASSWORD = 'guest';
    process.env.PORT = '3000';
    process.env.SAGA_PRAZO_S = '2';

    const { AppModule } = await import('@ioc/app.module');
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await conexao?.close().catch(() => undefined);
    await Promise.all([banco?.stop(), rabbit?.stop()]);
  });

  const novaAcao = (turno: string) => ({
    regiaoId: CENTRO,
    tipo: 'LIMPEZA_DRENAGEM',
    data: amanha(),
    turno,
    especialidade: 'DRENAGEM',
    categoriaRecurso: 'CAMINHAO_HIDROJATO',
  });

  async function solicitar(
    turno: string,
  ): Promise<{ acaoId: string; sagaId: string; links: Record<string, unknown> }> {
    const resposta = await request(app.getHttpServer()).post('/v1/acoes').send(novaAcao(turno));
    expect(resposta.status).toBe(202);
    expect(resposta.body.estado).toBe('PENDENTE');
    expect(resposta.headers.location).toBe(`/v1/acoes/${resposta.body.id}`);
    const saga = await request(app.getHttpServer()).get(`/v1/acoes/${resposta.body.id}/saga`);
    return { acaoId: resposta.body.id, sagaId: saga.body.sagaId, links: resposta.body._links };
  }

  const obterAcao = (id: string) => request(app.getHttpServer()).get(`/v1/acoes/${id}`).then((r) => r.body);
  const obterSaga = (id: string) => request(app.getHttpServer()).get(`/v1/acoes/${id}/saga`).then((r) => r.body);

  it('caminho feliz: reserva a equipe, depois o recurso, e confirma a ação', async () => {
    equipes.politica = () => ({ tipo: 'EquipeReservada', dados: { reservaId: randomUUID(), equipeId: EQUIPE } });
    frota.politica = () => ({ tipo: 'RecursoReservado', dados: { reservaId: randomUUID(), recursoId: CAMINHAO } });

    const { acaoId, sagaId, links } = await solicitar('MANHA');
    // PENDENTE não oferece transição nenhuma.
    expect(Object.keys(links)).toEqual(['self', 'regiao', 'saga']);

    const acao = await esperarAte(() => obterAcao(acaoId), (a) => a.estado !== 'PENDENTE');
    expect(acao.estado).toBe('CONFIRMADA');
    expect(acao.equipeId).toBe(EQUIPE);
    expect(acao.recursoId).toBe(CAMINHAO);
    expect(acao._links.cancelar).toEqual(expect.objectContaining({ method: 'POST' }));

    const saga = await obterSaga(acaoId);
    expect(saga.estado).toBe('CONCLUIDA');
    expect(saga.passos.map((p: { mensagem: string }) => p.mensagem)).toEqual([
      'ReservarEquipe',
      'EquipeReservada',
      'ReservarRecurso',
      'RecursoReservado',
    ]);

    // A ordem é fixa: o recurso só é pedido depois que a equipe foi reservada.
    expect(equipes.daSaga(sagaId)).toEqual(['ReservarEquipe']);
    expect(frota.daSaga(sagaId)).toEqual(['ReservarRecurso']);
    const reservar = frota.recebidos.find((m) => m.dados.sagaId === sagaId)!;
    expect(reservar.correlationId).toBe(sagaId);
    expect(reservar.dados).toEqual(expect.objectContaining({ categoria: 'CAMINHAO_HIDROJATO', turno: 'MANHA' }));

    const confirmada = await esperarAte<Mensagem | undefined>(
      async () => eventos.find((e) => e.tipo === 'AcaoPreventivaConfirmada' && e.dados.acaoId === acaoId),
      Boolean,
    );
    expect(confirmada?.dados).toEqual(expect.objectContaining({ sagaId, equipeId: EQUIPE, recursoId: CAMINHAO }));
  });

  it('recurso recusado: libera a equipe já reservada e rejeita a ação', async () => {
    const motivo = 'Nenhum recurso da categoria CAMINHAO_HIDROJATO disponível: HJT1A23 em manutenção.';
    equipes.politica = (c) =>
      c.tipo === 'ReservarEquipe'
        ? { tipo: 'EquipeReservada', dados: { reservaId: randomUUID(), equipeId: EQUIPE } }
        : { tipo: 'EquipeLiberada', dados: {} };
    frota.politica = () => ({ tipo: 'ReservaRecursoRecusada', dados: { motivo } });

    const { acaoId, sagaId } = await solicitar('TARDE');

    const acao = await esperarAte(() => obterAcao(acaoId), (a) => a.estado !== 'PENDENTE');
    expect(acao.estado).toBe('REJEITADA');
    expect(acao.motivoRejeicao).toBe(motivo);
    expect(acao._links.cancelar).toBeUndefined();

    const saga = await obterSaga(acaoId);
    expect(saga.estado).toBe('COMPENSADA');
    expect(saga.passos.map((p: { mensagem: string; direcao: string }) => `${p.direcao} ${p.mensagem}`)).toEqual([
      'ENVIADA ReservarEquipe',
      'RECEBIDA EquipeReservada',
      'ENVIADA ReservarRecurso',
      'RECEBIDA ReservaRecursoRecusada',
      'ENVIADA LiberarEquipe',
      'RECEBIDA EquipeLiberada',
    ]);
    expect(equipes.daSaga(sagaId)).toEqual(['ReservarEquipe', 'LiberarEquipe']);
    // Frota recusou: não há reserva de recurso para desfazer.
    expect(frota.daSaga(sagaId)).toEqual(['ReservarRecurso']);

    const rejeitada = await esperarAte<Mensagem | undefined>(
      async () => eventos.find((e) => e.tipo === 'AcaoPreventivaRejeitada' && e.dados.acaoId === acaoId),
      Boolean,
    );
    expect(rejeitada?.dados.motivo).toBe(motivo);
  });

  it('sem resposta no prazo: compensa a equipe e o recurso e ignora a resposta atrasada', async () => {
    equipes.politica = (c) =>
      c.tipo === 'ReservarEquipe'
        ? { tipo: 'EquipeReservada', dados: { reservaId: randomUUID(), equipeId: EQUIPE } }
        : { tipo: 'EquipeLiberada', dados: {} };
    // Frota fica muda no ReservarRecurso e só responde às liberações.
    frota.politica = (c) => (c.tipo === 'LiberarRecurso' ? { tipo: 'RecursoLiberado', dados: {} } : null);

    const { acaoId, sagaId } = await solicitar('NOITE');

    const acao = await esperarAte(() => obterAcao(acaoId), (a) => a.estado !== 'PENDENTE', 20000);
    expect(acao.estado).toBe('REJEITADA');
    expect(acao.motivoRejeicao).toBe('Frota não respondeu dentro do prazo.');
    expect(equipes.daSaga(sagaId)).toEqual(['ReservarEquipe', 'LiberarEquipe']);
    expect(frota.daSaga(sagaId)).toEqual(['ReservarRecurso', 'LiberarRecurso']);

    // A reserva chega atrasada, depois da compensação: é registrada e ignorada.
    const canal = await conexao.createChannel();
    canal.publish('pluvia.comandos', 'operacoes.respostas', Buffer.from(JSON.stringify({
      id: randomUUID(),
      tipo: 'RecursoReservado',
      versao: 1,
      origem: 'frota',
      ocorridoEm: new Date().toISOString(),
      correlationId: sagaId,
      causationId: null,
      dados: { sagaId, reservaId: randomUUID(), recursoId: CAMINHAO },
    })));
    await canal.close();

    const saga = await esperarAte(() => obterSaga(acaoId), (s) => s.passos.length >= 8);
    expect(saga.estado).toBe('COMPENSADA');
    expect(saga.passos.at(-1)).toEqual(
      expect.objectContaining({ mensagem: 'RecursoReservado', detalhe: 'RecursoReservado ignorada: a SAGA está em COMPENSADA.' }),
    );
    expect((await obterAcao(acaoId)).estado).toBe('REJEITADA');
  });

  it('mensagem repetida não é aplicada duas vezes', async () => {
    equipes.politica = () => null;
    frota.politica = () => null;
    const { acaoId, sagaId } = await solicitar('MANHA');
    await esperarAte(async () => equipes.daSaga(sagaId), (t) => t.length === 1);
    const primeira = equipes.recebidos.find((m) => m.dados.sagaId === sagaId);

    const resposta = {
      id: randomUUID(),
      tipo: 'EquipeReservada',
      versao: 1,
      origem: 'equipes',
      ocorridoEm: new Date().toISOString(),
      correlationId: sagaId,
      causationId: primeira!.id,
      dados: { sagaId, reservaId: randomUUID(), equipeId: EQUIPE },
    };
    const canal = await conexao.createChannel();
    const corpo = Buffer.from(JSON.stringify(resposta));
    canal.publish('pluvia.comandos', 'operacoes.respostas', corpo);
    canal.publish('pluvia.comandos', 'operacoes.respostas', corpo);
    await canal.close();

    await esperarAte(async () => frota.daSaga(sagaId), (t) => t.length >= 1);
    await new Promise((r) => setTimeout(r, 1000));
    const saga = await obterSaga(acaoId);
    expect(saga.passos.filter((p: { mensagem: string }) => p.mensagem === 'EquipeReservada')).toHaveLength(1);
    expect(frota.daSaga(sagaId).filter((t) => t === 'ReservarRecurso')).toHaveLength(1);
  });

  it('bloqueio semântico: ação PENDENTE não pode ser cancelada (409)', async () => {
    equipes.politica = () => null;
    const { acaoId } = await solicitar('TARDE');

    const resposta = await request(app.getHttpServer())
      .post(`/v1/acoes/${acaoId}/cancelamento`)
      .send({ motivo: 'Mudança de planejamento' });

    expect(resposta.status).toBe(409);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('rejeita requisição inválida com 400 em problem+json', async () => {
    const resposta = await request(app.getHttpServer()).post('/v1/acoes').send({ regiaoId: 'x' });

    expect(resposta.status).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(resposta.body.detail).toContain('regiaoId');
  });
});
