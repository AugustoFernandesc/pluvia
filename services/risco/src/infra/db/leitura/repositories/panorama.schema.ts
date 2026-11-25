import { EntitySchema } from 'typeorm';

import { Panorama } from '@domain/panorama';

export const PanoramaSchema = new EntitySchema<Panorama>({
  name: 'Panorama',
  tableName: 'panorama_regiao',
  columns: {
    regiaoId: { name: 'regiao_id', type: 'uuid', primary: true },
    regiaoNome: { name: 'regiao_nome', type: 'text' },
    municipio: { type: 'text' },
    nivelAtencao: { name: 'nivel_atencao', type: 'text' },
    documento: { type: 'jsonb' },
    // bigint chega do pg como string; o transformer devolve number.
    versao: {
      type: 'bigint',
      transformer: { to: (v: number) => v, from: (v: string | number) => Number(v) },
    },
    atualizadoEm: { name: 'atualizado_em', type: 'timestamptz' },
  },
});
