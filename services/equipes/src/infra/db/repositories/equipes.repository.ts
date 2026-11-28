import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import {
  Equipe,
  Especialidade,
  EstadoReserva,
  RepositorioEquipes,
  Reserva,
  Turno,
} from '@domain/equipe';
import { Envelope } from '@domain/mensagem';
import { TransacaoEquipes, UnidadeDeTrabalho } from '@use-cases/processar-mensagem';
import { inserirNaOutbox, registrarProcessada } from '@infra/db/mensageria.sql';
import { EXCHANGE_COMANDOS } from '@infra/mensageria/conexao-rabbitmq';

/** Respostas da SAGA vão para a fila do orquestrador. */
const ROTA_RESPOSTAS = 'operacoes.respostas';

const COLUNAS_EQUIPE = `id, nome, especialidade, integrantes, ativa, criada_em AS "criadaEm"`;
// `data::text` evita que o driver converta a data em Date no fuso local.
const COLUNAS_RESERVA = `id, equipe_id AS "equipeId", acao_id AS "acaoId", saga_id AS "sagaId",
  data::text AS data, turno, estado`;

@Injectable()
export class RepositorioEquipesTypeorm implements RepositorioEquipes {
  constructor(private readonly banco: DataSource) {}

  listar(especialidade?: Especialidade): Promise<Equipe[]> {
    return this.banco.query(
      `SELECT ${COLUNAS_EQUIPE} FROM equipes
        WHERE $1::text IS NULL OR especialidade = $1
        ORDER BY nome`,
      [especialidade ?? null],
    );
  }

  reservasNaData(data: string): Promise<Reserva[]> {
    return this.banco.query(`SELECT ${COLUNAS_RESERVA} FROM reservas WHERE data = $1`, [data]);
  }
}

class TransacaoEquipesTypeorm implements TransacaoEquipes {
  constructor(private readonly m: EntityManager) {}

  async reservaDaSaga(sagaId: string): Promise<Reserva | null> {
    const [reserva] = await this.m.query(`SELECT ${COLUNAS_RESERVA} FROM reservas WHERE saga_id = $1`, [sagaId]);
    return reserva ?? null;
  }

  equipes(): Promise<Equipe[]> {
    return this.m.query(`SELECT ${COLUNAS_EQUIPE} FROM equipes`);
  }

  async equipesOcupadas(data: string, turno: Turno): Promise<Set<string>> {
    const linhas: { equipe_id: string }[] = await this.m.query(
      `SELECT equipe_id FROM reservas
        WHERE data = $1 AND turno = $2 AND estado IN ('PROVISORIA', 'CONFIRMADA')`,
      [data, turno],
    );
    return new Set(linhas.map((l) => l.equipe_id));
  }

  async criarReserva(r: Reserva): Promise<void> {
    await this.m.query(
      `INSERT INTO reservas (id, equipe_id, acao_id, saga_id, data, turno, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [r.id, r.equipeId, r.acaoId, r.sagaId, r.data, r.turno, r.estado],
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

  processar(mensagem: Envelope, trabalho: (tx: TransacaoEquipes) => Promise<void>): Promise<boolean> {
    return this.banco.transaction(async (m) => {
      if (!(await registrarProcessada(m, mensagem))) return false;
      await trabalho(new TransacaoEquipesTypeorm(m));
      return true;
    });
  }
}
