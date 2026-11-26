import { MigrationInterface, QueryRunner } from 'typeorm';

import { SQL_TABELAS_MENSAGERIA } from '@infra/db/mensageria.sql';

// O caminhão hidrojato é único de propósito: com ele em manutenção, a SAGA
// não tem recurso para reservar e precisa compensar (demo da Parte 4).
export const CAMINHAO_HIDROJATO = '9b3c4d50-0000-4000-8000-000000000001';

export class CriaRecursosEReservas1764200000000 implements MigrationInterface {
  name = 'CriaRecursosEReservas1764200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE recursos (
        id uuid PRIMARY KEY,
        tipo text NOT NULL CHECK (tipo IN ('VEICULO', 'EQUIPAMENTO')),
        categoria text NOT NULL CHECK (categoria IN
          ('CAMINHAO_HIDROJATO', 'RETROESCAVADEIRA', 'CAMINHONETE', 'BOMBA_SUCCAO', 'KIT_VISTORIA')),
        identificacao text NOT NULL UNIQUE,
        descricao text NULL,
        situacao text NOT NULL DEFAULT 'OPERACIONAL' CHECK (situacao IN ('OPERACIONAL', 'INATIVO')),
        criado_em timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE manutencoes (
        id uuid PRIMARY KEY,
        recurso_id uuid NOT NULL REFERENCES recursos (id),
        inicio timestamptz NOT NULL,
        fim timestamptz NOT NULL CHECK (fim > inicio),
        motivo text NOT NULL,
        registrada_em timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX manutencoes_periodo ON manutencoes (recurso_id, inicio, fim);

      CREATE TABLE reservas (
        id uuid PRIMARY KEY,
        recurso_id uuid NOT NULL REFERENCES recursos (id),
        acao_id uuid NOT NULL,
        saga_id uuid NOT NULL UNIQUE,
        data date NOT NULL,
        turno text NOT NULL CHECK (turno IN ('MANHA', 'TARDE', 'NOITE')),
        estado text NOT NULL CHECK (estado IN ('PROVISORIA', 'CONFIRMADA', 'CANCELADA')),
        criada_em timestamptz NOT NULL DEFAULT now(),
        atualizada_em timestamptz NOT NULL DEFAULT now()
      );
      -- Um recurso nunca fica com duas reservas ativas no mesmo turno.
      CREATE UNIQUE INDEX reservas_turno_ocupado ON reservas (recurso_id, data, turno)
        WHERE estado IN ('PROVISORIA', 'CONFIRMADA');

      ${SQL_TABELAS_MENSAGERIA}
    `);

    await queryRunner.query(
      `INSERT INTO recursos (id, tipo, categoria, identificacao, descricao) VALUES
        ($1, 'VEICULO', 'CAMINHAO_HIDROJATO', 'HJT1A23', 'Caminhão hidrojato de desobstrução')`,
      [CAMINHAO_HIDROJATO],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE mensagens_processadas, outbox, reservas, manutencoes, recursos');
  }
}
