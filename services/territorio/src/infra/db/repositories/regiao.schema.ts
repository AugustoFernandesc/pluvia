import { EntitySchema } from 'typeorm';

import { Regiao } from '@domain/regiao';

export const RegiaoSchema = new EntitySchema<Regiao>({
  name: 'Regiao',
  tableName: 'regioes',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    codigo: { type: 'text', unique: true },
    nome: { type: 'text' },
    municipio: { type: 'text' },
    uf: { type: 'char', length: 2 },
    geometria: {
      type: 'geometry',
      spatialFeatureType: 'MultiPolygon',
      srid: 4326,
    },
    caracteristicas: { type: 'jsonb', nullable: true },
    criadaEm: { name: 'criada_em', type: 'timestamptz', createDate: true },
    atualizadaEm: { name: 'atualizada_em', type: 'timestamptz', updateDate: true },
  },
});
