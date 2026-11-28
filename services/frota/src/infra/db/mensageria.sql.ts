import { EntityManager } from 'typeorm';

import { Envelope } from '@domain/mensagem';

/** Tabelas outbox e mensagens_processadas, iguais nos três serviços da SAGA. */
export const SQL_TABELAS_MENSAGERIA = `
  CREATE TABLE outbox (
    id uuid PRIMARY KEY,
    seq bigserial NOT NULL,
    tipo text NOT NULL,
    exchange text NOT NULL,
    routing_key text NOT NULL,
    payload jsonb NOT NULL,
    criado_em timestamptz NOT NULL DEFAULT now(),
    publicado_em timestamptz NULL
  );
  CREATE INDEX outbox_pendentes ON outbox (seq) WHERE publicado_em IS NULL;
  CREATE TABLE mensagens_processadas (
    id uuid PRIMARY KEY,
    tipo text NOT NULL,
    processada_em timestamptz NOT NULL DEFAULT now()
  );
`;

export async function inserirNaOutbox(
  m: EntityManager,
  exchange: string,
  routingKey: string,
  envelope: Envelope,
): Promise<void> {
  await m.query(
    `INSERT INTO outbox (id, tipo, exchange, routing_key, payload) VALUES ($1, $2, $3, $4, $5)`,
    [envelope.id, envelope.tipo, exchange, routingKey, JSON.stringify(envelope)],
  );
}

/** Registra a mensagem como processada. Devolve false se ela já tinha sido. */
export async function registrarProcessada(m: EntityManager, envelope: Envelope): Promise<boolean> {
  const linhas: unknown[] = await m.query(
    `INSERT INTO mensagens_processadas (id, tipo) VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING RETURNING id`,
    [envelope.id, envelope.tipo],
  );
  return linhas.length > 0;
}
