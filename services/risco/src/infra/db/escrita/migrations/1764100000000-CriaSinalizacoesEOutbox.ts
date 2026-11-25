import { MigrationInterface, QueryRunner } from 'typeorm';

import { SINALIZACAO_CENTRO } from '@infra/db/semente';

/**
 * Banco de escrita: as sinalizações (07-cqrs.md) e a outbox. A outbox fica no
 * mesmo banco para que a mudança e o evento sejam gravados na mesma transação.
 */
export class CriaSinalizacoesEOutbox1764100000000 implements MigrationInterface {
  name = 'CriaSinalizacoesEOutbox1764100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sinalizacoes (
        id               uuid PRIMARY KEY,
        regiao_id        uuid NOT NULL,
        origem           text NOT NULL CHECK (origem IN ('OBSERVADO', 'PREVISTO')),
        nivel_atencao    text NOT NULL CHECK (nivel_atencao IN ('NORMAL', 'OBSERVACAO', 'ATENCAO', 'ALTA_ATENCAO')),
        motivo           text NOT NULL,
        fatores          jsonb NOT NULL,
        estado           text NOT NULL CHECK (estado IN ('ABERTA', 'RECONHECIDA', 'ENCERRADA')),
        emitida_em       timestamptz NOT NULL,
        reconhecida_por  uuid,
        reconhecida_em   timestamptz,
        encerrada_em     timestamptz
      )`);
    await queryRunner.query(
      'CREATE INDEX sinalizacoes_por_regiao ON sinalizacoes (regiao_id, estado)',
    );

    await queryRunner.query(`
      CREATE TABLE outbox (
        id uuid PRIMARY KEY,
        routing_key text NOT NULL,
        payload jsonb NOT NULL,
        criado_em timestamptz NOT NULL DEFAULT now(),
        publicado_em timestamptz
      )`);
    // O publicador só procura o que falta publicar, em ordem de criação.
    await queryRunner.query(
      'CREATE INDEX outbox_pendentes ON outbox (criado_em) WHERE publicado_em IS NULL',
    );

    const s = SINALIZACAO_CENTRO;
    await queryRunner.query(
      `INSERT INTO sinalizacoes (id, regiao_id, origem, nivel_atencao, motivo, fatores, estado, emitida_em)
       VALUES ($1, $2, $3, $4, $5, $6, 'ABERTA', now())`,
      [s.id, s.regiaoId, s.origem, s.nivel, s.motivo, JSON.stringify(s.fatores)],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE outbox');
    await queryRunner.query('DROP TABLE sinalizacoes');
  }
}
