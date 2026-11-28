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
import { connect } from 'amqplib';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';

import { configurarApp } from '@ioc/configurar-app';

const CENTRO = '6f1c2a10-0000-4000-8000-000000000001';
const SINALIZACAO = '7a3e5b20-0000-4000-8000-000000000001';
const VHOST = 'pluvia';

interface Definicoes {
  exchanges: { name: string; type: string; durable: boolean }[];
  queues: { name: string; durable: boolean; arguments: Record<string, unknown> }[];
  bindings: { source: string; destination: string; routing_key: string }[];
}

/**
 * Cria no broker de teste a mesma topologia do RabbitMQ do projeto, lida do
 * infra/rabbitmq/definitions.json: os exchanges, a fila risco.projetor e as
 * ligações dela. O serviço não declara nada; ele usa o que já existe.
 */
async function criarTopologia(url: string): Promise<void> {
  const caminho = join(__dirname, '..', '..', '..', 'infra', 'rabbitmq', 'definitions.json');
  const definicoes: Definicoes = JSON.parse(readFileSync(caminho, 'utf8'));
  const conexao = await connect(url);
  const canal = await conexao.createChannel();
  for (const e of definicoes.exchanges) {
    await canal.assertExchange(e.name, e.type, { durable: e.durable });
  }
  for (const q of definicoes.queues.filter((q) => q.name === 'risco.projetor')) {
    await canal.assertQueue(q.name, { durable: q.durable, arguments: q.arguments });
  }
  for (const b of definicoes.bindings.filter((b) => b.destination === 'risco.projetor')) {
    await canal.bindQueue(b.destination, b.source, b.routing_key);
  }
  await conexao.close();
}

function subirBanco(nome: string): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase(`risco_${nome}`)
    .withUsername(`risco_${nome}`)
    .withPassword(`senha-${nome}`)
    .start();
}

function definirBanco(prefixo: 'ESCRITA' | 'LEITURA', banco: StartedPostgreSqlContainer): void {
  process.env[`POSTGRES_${prefixo}_HOST`] = banco.getHost();
  process.env[`POSTGRES_${prefixo}_PORT`] = String(banco.getPort());
  process.env[`POSTGRES_${prefixo}_DB`] = banco.getDatabase();
  process.env[`POSTGRES_${prefixo}_USER`] = banco.getUsername();
  process.env[`POSTGRES_${prefixo}_PASSWORD`] = banco.getPassword();
}

/** Pergunta de novo a cada 200 ms, por até 5 s, até a condição valer. */
async function esperarAte<T>(consulta: () => Promise<T>, condicao: (valor: T) => boolean): Promise<T> {
  const limite = Date.now() + 5000;
  for (;;) {
    const valor = await consulta();
    if (condicao(valor) || Date.now() > limite) return valor;
    await new Promise((r) => setTimeout(r, 200));
  }
}

/**
 * O CQRS de ponta a ponta: o comando grava no banco de escrita e o panorama,
 * no banco de leitura, muda sozinho depois. Quem leva a mudança de um banco
 * para o outro é o evento: outbox, RabbitMQ e projetor.
 */
describe('CQRS do Risco (e2e)', () => {
  let escrita: StartedPostgreSqlContainer;
  let leitura: StartedPostgreSqlContainer;
  let rabbit: StartedRabbitMQContainer;
  let app: INestApplication;

  beforeAll(async () => {
    [escrita, leitura, rabbit] = await Promise.all([
      subirBanco('escrita'),
      subirBanco('leitura'),
      new RabbitMQContainer('rabbitmq:4.1-management-alpine')
        .withEnvironment({ RABBITMQ_DEFAULT_VHOST: VHOST })
        .start(),
    ]);
    await criarTopologia(`${rabbit.getAmqpUrl()}/${VHOST}`);

    definirBanco('ESCRITA', escrita);
    definirBanco('LEITURA', leitura);
    process.env.RABBITMQ_HOST = rabbit.getHost();
    process.env.RABBITMQ_PORT = String(rabbit.getMappedPort(5672));
    process.env.RABBITMQ_VHOST = VHOST;
    process.env.RABBITMQ_USER = 'guest';
    process.env.RABBITMQ_PASSWORD = 'guest';
    process.env.PORT = '3000';

    const { AppModule } = await import('@ioc/app.module');
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([escrita?.stop(), leitura?.stop(), rabbit?.stop()]);
  });

  it('reconhece no modelo de escrita e o modelo de leitura muda sozinho', async () => {
    const http = request(app.getHttpServer());
    const sinalizacaoNoPanorama = (corpo: { sinalizacoes: { id: string; estado: string }[] }) =>
      corpo.sinalizacoes.find((s) => s.id === SINALIZACAO);

    // 1. O panorama do Centro, no banco de leitura, mostra a sinalização ABERTA.
    const antes = await http.get(`/v1/panoramas/${CENTRO}`);
    expect(antes.status).toBe(200);
    expect(sinalizacaoNoPanorama(antes.body)?.estado).toBe('ABERTA');
    expect(antes.body.sinalizacoesAbertas).toBe(2);

    // 2. O comando, no banco de escrita.
    const comando = await http.post(`/v1/sinalizacoes/${SINALIZACAO}/reconhecimento`);
    expect(comando.status).toBe(200);
    expect(comando.body.estado).toBe('RECONHECIDA');

    // A consulta de sinalizações lê da escrita, então já vê o estado novo.
    const naEscrita = await http.get(`/v1/sinalizacoes/${SINALIZACAO}`);
    expect(naEscrita.body.estado).toBe('RECONHECIDA');

    // 3 e 4. Sem nenhuma outra chamada, o panorama muda em até 5 s.
    const depois = await esperarAte(
      () => http.get(`/v1/panoramas/${CENTRO}`),
      (r) => sinalizacaoNoPanorama(r.body)?.estado === 'RECONHECIDA',
    );
    expect(sinalizacaoNoPanorama(depois.body)?.estado).toBe('RECONHECIDA');
    expect(depois.body.versao).toBeGreaterThan(antes.body.versao);
    expect(depois.body.sinalizacoesAbertas).toBe(1);
  });

  it('responde 409 ao reconhecer de novo e 404 para sinalização inexistente, em problem+json', async () => {
    const http = request(app.getHttpServer());

    const deNovo = await http.post(`/v1/sinalizacoes/${SINALIZACAO}/reconhecimento`);
    expect(deNovo.status).toBe(409);
    expect(deNovo.headers['content-type']).toContain('application/problem+json');

    const inexistente = await http.post('/v1/sinalizacoes/7a3e5b20-0000-4000-8000-0000000000ff/reconhecimento');
    expect(inexistente.status).toBe(404);
    expect(inexistente.headers['content-type']).toContain('application/problem+json');
  });

  it('lista os panoramas do nível mais grave para o mais leve', async () => {
    const resposta = await request(app.getHttpServer()).get('/v1/panoramas');

    expect(resposta.status).toBe(200);
    expect(resposta.body.total).toBe(5);
    expect(resposta.body.itens.map((p: { nivelAtencao: string }) => p.nivelAtencao)).toEqual([
      'ATENCAO',
      'OBSERVACAO',
      'NORMAL',
      'NORMAL',
      'NORMAL',
    ]);
  });
});
