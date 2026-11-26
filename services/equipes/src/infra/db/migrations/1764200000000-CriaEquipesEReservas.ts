import { MigrationInterface, QueryRunner } from 'typeorm';

import { SQL_TABELAS_MENSAGERIA } from '@infra/db/mensageria.sql';

// Ids fixos para a demo da SAGA e para os outros serviços poderem citá-las.
export const EQUIPE_DRENAGEM = '8a2b3c40-0000-4000-8000-000000000001';
export const EQUIPE_VISTORIA = '8a2b3c40-0000-4000-8000-000000000002';

export class CriaEquipesEReservas1764200000000 implements MigrationInterface {
  name = 'CriaEquipesEReservas1764200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE equipes (
        id uuid PRIMARY KEY,
        nome text NOT NULL UNIQUE,
        especialidade text NOT NULL CHECK (especialidade IN ('DRENAGEM', 'VISTORIA', 'DESOBSTRUCAO', 'GERAL')),
        integrantes integer NOT NULL CHECK (integrantes >= 1),
        ativa boolean NOT NULL DEFAULT true,
        criada_em timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE reservas (
        id uuid PRIMARY KEY,
        equipe_id uuid NOT NULL REFERENCES equipes (id),
        acao_id uuid NOT NULL,
        saga_id uuid NOT NULL UNIQUE,
        data date NOT NULL,
        turno text NOT NULL CHECK (turno IN ('MANHA', 'TARDE', 'NOITE')),
        estado text NOT NULL CHECK (estado IN ('PROVISORIA', 'CONFIRMADA', 'CANCELADA')),
        criada_em timestamptz NOT NULL DEFAULT now(),
        atualizada_em timestamptz NOT NULL DEFAULT now()
      );
      -- Uma equipe nunca fica com duas reservas ativas no mesmo turno.
      CREATE UNIQUE INDEX reservas_turno_ocupado ON reservas (equipe_id, data, turno)
        WHERE estado IN ('PROVISORIA', 'CONFIRMADA');

      ${SQL_TABELAS_MENSAGERIA}
    `);

    await queryRunner.query(
      `INSERT INTO equipes (id, nome, especialidade, integrantes) VALUES
        ($1, 'Equipe Drenagem Centro', 'DRENAGEM', 4),
        ($2, 'Equipe Vistoria Norte', 'VISTORIA', 2)`,
      [EQUIPE_DRENAGEM, EQUIPE_VISTORIA],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE mensagens_processadas, outbox, reservas, equipes');
  }
}
