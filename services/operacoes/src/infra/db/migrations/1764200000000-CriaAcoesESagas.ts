import { MigrationInterface, QueryRunner } from 'typeorm';

import { SQL_TABELAS_MENSAGERIA } from '@infra/db/mensageria.sql';

export class CriaAcoesESagas1764200000000 implements MigrationInterface {
  name = 'CriaAcoesESagas1764200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE acoes (
        id uuid PRIMARY KEY,
        regiao_id uuid NOT NULL,
        sinalizacao_id uuid NULL,
        tipo text NOT NULL CHECK (tipo IN ('VISTORIA', 'LIMPEZA_DRENAGEM', 'DESOBSTRUCAO', 'INSPECAO_PONTO_CRITICO')),
        descricao text NULL,
        data date NOT NULL,
        turno text NOT NULL CHECK (turno IN ('MANHA', 'TARDE', 'NOITE')),
        especialidade text NOT NULL,
        categoria_recurso text NOT NULL,
        equipe_solicitada_id uuid NULL,
        estado text NOT NULL CHECK (estado IN
          ('PENDENTE', 'CONFIRMADA', 'REJEITADA', 'EM_EXECUCAO', 'CONCLUIDA', 'CANCELADA')),
        equipe_id uuid NULL,
        recurso_id uuid NULL,
        motivo_rejeicao text NULL,
        motivo_cancelamento text NULL,
        criada_em timestamptz NOT NULL,
        atualizada_em timestamptz NOT NULL
      );
      CREATE INDEX acoes_estado ON acoes (estado);
      CREATE INDEX acoes_regiao ON acoes (regiao_id);

      CREATE TABLE sagas (
        id uuid PRIMARY KEY,
        acao_id uuid NOT NULL UNIQUE REFERENCES acoes (id),
        estado text NOT NULL CHECK (estado IN
          ('AGUARDANDO_EQUIPE', 'AGUARDANDO_RECURSO', 'CONCLUIDA', 'COMPENSANDO', 'COMPENSADA')),
        equipe_id uuid NULL,
        recurso_id uuid NULL,
        motivo text NULL,
        aguarda_liberar_equipe boolean NOT NULL DEFAULT false,
        aguarda_liberar_recurso boolean NOT NULL DEFAULT false,
        prazo timestamptz NULL,
        iniciada_em timestamptz NOT NULL,
        encerrada_em timestamptz NULL
      );
      CREATE INDEX sagas_com_prazo ON sagas (prazo) WHERE prazo IS NOT NULL;

      CREATE TABLE saga_passos (
        seq bigserial PRIMARY KEY,
        saga_id uuid NOT NULL REFERENCES sagas (id),
        mensagem text NOT NULL,
        direcao text NOT NULL CHECK (direcao IN ('ENVIADA', 'RECEBIDA')),
        participante text NULL CHECK (participante IN ('EQUIPES', 'FROTA')),
        detalhe text NULL,
        registrado_em timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE INDEX saga_passos_saga ON saga_passos (saga_id, seq);

      ${SQL_TABELAS_MENSAGERIA}
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE mensagens_processadas, outbox, saga_passos, sagas, acoes');
  }
}
