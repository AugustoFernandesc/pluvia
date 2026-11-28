import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { Acao } from '@domain/acao';
import { Envelope } from '@domain/mensagem';
import { FiltroAcoes, RepositorioAcoes, TransacaoOperacoes, UnidadeDeTrabalho } from '@domain/portas';
import { PassoSaga, Saga } from '@domain/saga';
import { inserirNaOutbox, registrarProcessada } from '@infra/db/mensageria.sql';
import { EXCHANGE_COMANDOS, EXCHANGE_EVENTOS } from '@infra/mensageria/conexao-rabbitmq';

// `data::text` evita que o driver converta a data em Date no fuso local.
const COLUNAS_ACAO = `id, regiao_id AS "regiaoId", sinalizacao_id AS "sinalizacaoId", tipo, descricao,
  data::text AS data, turno, especialidade, categoria_recurso AS "categoriaRecurso",
  equipe_solicitada_id AS "equipeSolicitadaId", estado, equipe_id AS "equipeId", recurso_id AS "recursoId",
  motivo_rejeicao AS "motivoRejeicao", motivo_cancelamento AS "motivoCancelamento",
  criada_em AS "criadaEm", atualizada_em AS "atualizadaEm"`;

const COLUNAS_SAGA = `id, acao_id AS "acaoId", estado, equipe_id AS "equipeId", recurso_id AS "recursoId", motivo,
  aguarda_liberar_equipe AS "aguardaLiberarEquipe", aguarda_liberar_recurso AS "aguardaLiberarRecurso",
  prazo, iniciada_em AS "iniciadaEm", encerrada_em AS "encerradaEm"`;

type Linha = Record<string, unknown>;

/** O driver devolve timestamptz como Date; a API e o domínio usam ISO 8601. */
function comDatasIso<T>(linha: Linha | undefined, campos: string[]): T | null {
  if (!linha) return null;
  for (const campo of campos) {
    const valor = linha[campo];
    if (valor instanceof Date) linha[campo] = valor.toISOString();
  }
  return linha as T;
}

const acaoDe = (l?: Linha) => comDatasIso<Acao>(l, ['criadaEm', 'atualizadaEm']);
const sagaDe = (l?: Linha) => comDatasIso<Saga>(l, ['prazo', 'iniciadaEm', 'encerradaEm']);

@Injectable()
export class RepositorioAcoesTypeorm implements RepositorioAcoes {
  constructor(private readonly banco: DataSource) {}

  async listar(filtro: FiltroAcoes): Promise<{ itens: Acao[]; total: number }> {
    const onde = `WHERE ($1::text IS NULL OR estado = $1) AND ($2::uuid IS NULL OR regiao_id = $2)`;
    const parametros = [filtro.estado ?? null, filtro.regiaoId ?? null];
    const [linhas, [{ total }]] = await Promise.all([
      this.banco.query(
        `SELECT ${COLUNAS_ACAO} FROM acoes ${onde} ORDER BY criada_em DESC LIMIT $3 OFFSET $4`,
        [...parametros, filtro.tamanho, (filtro.pagina - 1) * filtro.tamanho],
      ),
      this.banco.query(`SELECT count(*)::int AS total FROM acoes ${onde}`, parametros),
    ]);
    return { itens: (linhas as Linha[]).map((l) => acaoDe(l) as Acao), total };
  }

  async obter(id: string): Promise<Acao | null> {
    const [linha] = await this.banco.query(`SELECT ${COLUNAS_ACAO} FROM acoes WHERE id = $1`, [id]);
    return acaoDe(linha);
  }

  async sagaDaAcao(acaoId: string): Promise<{ saga: Saga; passos: PassoSaga[] } | null> {
    const [linha] = await this.banco.query(`SELECT ${COLUNAS_SAGA} FROM sagas WHERE acao_id = $1`, [acaoId]);
    const saga = sagaDe(linha);
    if (!saga) return null;
    const passos: Linha[] = await this.banco.query(
      `SELECT mensagem, direcao, participante, detalhe, registrado_em AS "registradoEm"
         FROM saga_passos WHERE saga_id = $1 ORDER BY seq`,
      [saga.id],
    );
    return { saga, passos: passos.map((p) => comDatasIso<PassoSaga>(p, ['registradoEm']) as PassoSaga) };
  }

  async sagasVencidas(agora: Date): Promise<string[]> {
    const linhas: { id: string }[] = await this.banco.query(
      `SELECT id FROM sagas WHERE prazo IS NOT NULL AND prazo <= $1 ORDER BY prazo LIMIT 50`,
      [agora],
    );
    return linhas.map((l) => l.id);
  }
}

class TransacaoOperacoesTypeorm implements TransacaoOperacoes {
  constructor(private readonly m: EntityManager) {}

  async acao(id: string): Promise<Acao | null> {
    const [linha] = await this.m.query(`SELECT ${COLUNAS_ACAO} FROM acoes WHERE id = $1 FOR UPDATE`, [id]);
    return acaoDe(linha);
  }

  async saga(id: string): Promise<Saga | null> {
    const [linha] = await this.m.query(`SELECT ${COLUNAS_SAGA} FROM sagas WHERE id = $1 FOR UPDATE`, [id]);
    return sagaDe(linha);
  }

  async sagaDaAcao(acaoId: string): Promise<Saga | null> {
    const [linha] = await this.m.query(`SELECT ${COLUNAS_SAGA} FROM sagas WHERE acao_id = $1`, [acaoId]);
    return sagaDe(linha);
  }

  async criarAcao(a: Acao): Promise<void> {
    await this.m.query(
      `INSERT INTO acoes (id, regiao_id, sinalizacao_id, tipo, descricao, data, turno, especialidade,
         categoria_recurso, equipe_solicitada_id, estado, criada_em, atualizada_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [a.id, a.regiaoId, a.sinalizacaoId, a.tipo, a.descricao, a.data, a.turno, a.especialidade,
        a.categoriaRecurso, a.equipeSolicitadaId, a.estado, a.criadaEm, a.atualizadaEm],
    );
  }

  async salvarAcao(a: Acao): Promise<void> {
    await this.m.query(
      `UPDATE acoes SET estado = $2, equipe_id = $3, recurso_id = $4, motivo_rejeicao = $5,
         motivo_cancelamento = $6, atualizada_em = $7
       WHERE id = $1`,
      [a.id, a.estado, a.equipeId, a.recursoId, a.motivoRejeicao, a.motivoCancelamento, a.atualizadaEm],
    );
  }

  async criarSaga(s: Saga): Promise<void> {
    await this.m.query(
      `INSERT INTO sagas (id, acao_id, estado, prazo, iniciada_em) VALUES ($1, $2, $3, $4, $5)`,
      [s.id, s.acaoId, s.estado, s.prazo, s.iniciadaEm],
    );
  }

  async salvarSaga(s: Saga): Promise<void> {
    await this.m.query(
      `UPDATE sagas SET estado = $2, equipe_id = $3, recurso_id = $4, motivo = $5,
         aguarda_liberar_equipe = $6, aguarda_liberar_recurso = $7, prazo = $8, encerrada_em = $9
       WHERE id = $1`,
      [s.id, s.estado, s.equipeId, s.recursoId, s.motivo, s.aguardaLiberarEquipe, s.aguardaLiberarRecurso,
        s.prazo, s.encerradaEm],
    );
  }

  async registrarPasso(sagaId: string, p: Omit<PassoSaga, 'registradoEm'>): Promise<void> {
    await this.m.query(
      `INSERT INTO saga_passos (saga_id, mensagem, direcao, participante, detalhe) VALUES ($1, $2, $3, $4, $5)`,
      [sagaId, p.mensagem, p.direcao, p.participante, p.detalhe],
    );
  }

  enviarComando(routingKey: string, mensagem: Envelope): Promise<void> {
    return inserirNaOutbox(this.m, EXCHANGE_COMANDOS, routingKey, mensagem);
  }

  publicarEvento(routingKey: string, mensagem: Envelope): Promise<void> {
    return inserirNaOutbox(this.m, EXCHANGE_EVENTOS, routingKey, mensagem);
  }
}

@Injectable()
export class UnidadeDeTrabalhoTypeorm implements UnidadeDeTrabalho {
  constructor(private readonly banco: DataSource) {}

  executar<T>(trabalho: (tx: TransacaoOperacoes) => Promise<T>): Promise<T> {
    return this.banco.transaction((m) => trabalho(new TransacaoOperacoesTypeorm(m)));
  }

  processar(mensagem: Envelope, trabalho: (tx: TransacaoOperacoes) => Promise<void>): Promise<boolean> {
    return this.banco.transaction(async (m) => {
      if (!(await registrarProcessada(m, mensagem))) return false;
      await trabalho(new TransacaoOperacoesTypeorm(m));
      return true;
    });
  }
}
