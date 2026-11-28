import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import {
  Categoria,
  EstadoReserva,
  Manutencao,
  Recurso,
  RepositorioFrota,
  Reserva,
  Turno,
  janelaDoTurno,
} from '@domain/frota';
import { Envelope } from '@domain/mensagem';
import { TransacaoFrota, UnidadeDeTrabalho } from '@use-cases/processar-mensagem';
import { inserirNaOutbox, registrarProcessada } from '@infra/db/mensageria.sql';
import { EXCHANGE_COMANDOS } from '@infra/mensageria/conexao-rabbitmq';

/** Respostas da SAGA vão para a fila do orquestrador. */
const ROTA_RESPOSTAS = 'operacoes.respostas';

const COLUNAS_RECURSO = `r.id, r.tipo, r.categoria, r.identificacao, r.descricao, r.situacao,
  r.criado_em AS "criadoEm",
  EXISTS (SELECT 1 FROM manutencoes m
           WHERE m.recurso_id = r.id AND now() >= m.inicio AND now() < m.fim) AS "emManutencaoAgora"`;
const COLUNAS_MANUTENCAO = `id, recurso_id AS "recursoId", inicio, fim, motivo`;
// `data::text` evita que o driver converta a data em Date no fuso local.
const COLUNAS_RESERVA = `id, recurso_id AS "recursoId", acao_id AS "acaoId", saga_id AS "sagaId",
  data::text AS data, turno, estado`;

@Injectable()
export class RepositorioFrotaTypeorm implements RepositorioFrota {
  constructor(private readonly banco: DataSource) {}

  listar(categoria?: Categoria): Promise<Recurso[]> {
    return this.banco.query(
      `SELECT ${COLUNAS_RECURSO} FROM recursos r
        WHERE $1::text IS NULL OR r.categoria = $1
        ORDER BY r.categoria, r.identificacao`,
      [categoria ?? null],
    );
  }

  async obter(id: string): Promise<Recurso | null> {
    const [recurso] = await this.banco.query(`SELECT ${COLUNAS_RECURSO} FROM recursos r WHERE r.id = $1`, [id]);
    return recurso ?? null;
  }

  async registrarManutencao(m: Manutencao): Promise<void> {
    await this.banco.query(
      `INSERT INTO manutencoes (id, recurso_id, inicio, fim, motivo) VALUES ($1, $2, $3, $4, $5)`,
      [m.id, m.recursoId, m.inicio, m.fim, m.motivo],
    );
  }

  reservasNaData(data: string): Promise<Reserva[]> {
    return this.banco.query(`SELECT ${COLUNAS_RESERVA} FROM reservas WHERE data = $1`, [data]);
  }

  async manutencoesNoPeriodo(inicio: Date, fim: Date): Promise<Manutencao[]> {
    const linhas: (Omit<Manutencao, 'inicio' | 'fim'> & { inicio: Date; fim: Date })[] = await this.banco.query(
      `SELECT ${COLUNAS_MANUTENCAO} FROM manutencoes WHERE inicio < $2 AND fim > $1`,
      [inicio, fim],
    );
    return linhas.map((l) => ({ ...l, inicio: l.inicio.toISOString(), fim: l.fim.toISOString() }));
  }
}

class TransacaoFrotaTypeorm implements TransacaoFrota {
  constructor(private readonly m: EntityManager) {}

  async reservaDaSaga(sagaId: string): Promise<Reserva | null> {
    const [reserva] = await this.m.query(`SELECT ${COLUNAS_RESERVA} FROM reservas WHERE saga_id = $1`, [sagaId]);
    return reserva ?? null;
  }

  recursos(): Promise<Recurso[]> {
    return this.m.query(`SELECT ${COLUNAS_RECURSO} FROM recursos r`);
  }

  async recursosOcupados(data: string, turno: Turno): Promise<Set<string>> {
    const linhas: { recurso_id: string }[] = await this.m.query(
      `SELECT recurso_id FROM reservas
        WHERE data = $1 AND turno = $2 AND estado IN ('PROVISORIA', 'CONFIRMADA')`,
      [data, turno],
    );
    return new Set(linhas.map((l) => l.recurso_id));
  }

  async recursosEmManutencao(data: string, turno: Turno): Promise<Set<string>> {
    const { inicio, fim } = janelaDoTurno(data, turno);
    const linhas: { recurso_id: string }[] = await this.m.query(
      `SELECT DISTINCT recurso_id FROM manutencoes WHERE inicio < $2 AND fim > $1`,
      [inicio, fim],
    );
    return new Set(linhas.map((l) => l.recurso_id));
  }

  async criarReserva(r: Reserva): Promise<void> {
    await this.m.query(
      `INSERT INTO reservas (id, recurso_id, acao_id, saga_id, data, turno, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [r.id, r.recursoId, r.acaoId, r.sagaId, r.data, r.turno, r.estado],
    );
  }

  async mudarEstado(sagaId: string, de: EstadoReserva[], para: EstadoReserva): Promise<number> {
    const linhas: unknown[] = await this.m.query(
      `UPDATE reservas SET estado = $3, atualizada_em = now()
        WHERE saga_id = $1 AND estado = ANY($2::text[])
        RETURNING id`,
      [sagaId, de, para],
    );
    return linhas.length;
  }

  responder(resposta: Envelope): Promise<void> {
    return inserirNaOutbox(this.m, EXCHANGE_COMANDOS, ROTA_RESPOSTAS, resposta);
  }
}

@Injectable()
export class UnidadeDeTrabalhoTypeorm implements UnidadeDeTrabalho {
  constructor(private readonly banco: DataSource) {}

  processar(mensagem: Envelope, trabalho: (tx: TransacaoFrota) => Promise<void>): Promise<boolean> {
    return this.banco.transaction(async (m) => {
      if (!(await registrarProcessada(m, mensagem))) return false;
      await trabalho(new TransacaoFrotaTypeorm(m));
      return true;
    });
  }
}
