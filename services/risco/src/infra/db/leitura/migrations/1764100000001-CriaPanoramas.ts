import { MigrationInterface, QueryRunner } from 'typeorm';

import { haHoras, REGIOES_SEMENTE, SINALIZACOES_SEMENTE } from '@infra/db/semente';

/**
 * Banco de leitura: um panorama por região (07-cqrs.md) e a tabela de
 * idempotência do projetor. O seed já reflete as sinalizações do banco de
 * escrita, como se o projetor tivesse aplicado os eventos delas.
 */
export class CriaPanoramas1764100000001 implements MigrationInterface {
  name = 'CriaPanoramas1764100000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE panorama_regiao (
        regiao_id       uuid        PRIMARY KEY,
        regiao_nome     text        NOT NULL,
        municipio       text        NOT NULL,
        nivel_atencao   text        NOT NULL,
        documento       jsonb       NOT NULL,
        versao          bigint      NOT NULL,
        atualizado_em   timestamptz NOT NULL
      )`);
    await queryRunner.query(
      'CREATE INDEX panorama_por_nivel ON panorama_regiao (nivel_atencao, municipio)',
    );

    await queryRunner.query(`
      CREATE TABLE projecao_controle (
        regiao_id      uuid NOT NULL,
        fonte          text NOT NULL,
        ultimo_evento  timestamptz NOT NULL,
        PRIMARY KEY (regiao_id, fonte)
      )`);

    await queryRunner.query(`
      CREATE TABLE mensagens_processadas (
        id             uuid PRIMARY KEY,
        tipo           text NOT NULL,
        processada_em  timestamptz NOT NULL DEFAULT now()
      )`);

    for (const r of REGIOES_SEMENTE) {
      const sinalizacoes = SINALIZACOES_SEMENTE.filter((s) => s.regiaoId === r.id).map((s) => ({
        id: s.id,
        estado: s.estado,
        nivel: s.nivel,
        ...(s.reconhecidaHaHoras === undefined
          ? {}
          : { reconhecidaEm: haHoras(s.reconhecidaHaHoras).toISOString() }),
      }));
      await queryRunner.query(
        `INSERT INTO panorama_regiao (regiao_id, regiao_nome, municipio, nivel_atencao, documento, versao, atualizado_em)
         VALUES ($1, $2, 'Lavras', $3, $4, 1, now())`,
        [r.id, r.nome, r.nivel, JSON.stringify({ fatores: [], sinalizacoes })],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE mensagens_processadas');
    await queryRunner.query('DROP TABLE projecao_controle');
    await queryRunner.query('DROP TABLE panorama_regiao');
  }
}
