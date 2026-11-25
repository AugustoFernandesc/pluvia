import { EntitySchema } from 'typeorm';

import { Sinalizacao } from '@domain/sinalizacao';

export const SinalizacaoSchema = new EntitySchema<Sinalizacao>({
  name: 'Sinalizacao',
  tableName: 'sinalizacoes',
  columns: {
    id: { type: 'uuid', primary: true },
    regiaoId: { name: 'regiao_id', type: 'uuid' },
    origem: { type: 'text' },
    nivelAtencao: { name: 'nivel_atencao', type: 'text' },
    motivo: { type: 'text' },
    fatores: { type: 'jsonb' },
    estado: { type: 'text' },
    emitidaEm: { name: 'emitida_em', type: 'timestamptz' },
    reconhecidaPor: { name: 'reconhecida_por', type: 'uuid', nullable: true },
    reconhecidaEm: { name: 'reconhecida_em', type: 'timestamptz', nullable: true },
    encerradaEm: { name: 'encerrada_em', type: 'timestamptz', nullable: true },
  },
});
