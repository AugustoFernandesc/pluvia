import { DataSource, DataSourceOptions } from 'typeorm';

import { Ambiente } from '@infra/config/validar-ambiente';
import { CriaRegioes1764000000000 } from '@infra/db/migrations/1764000000000-CriaRegioes';
import { RegiaoSchema } from '@infra/db/repositories/regiao.schema';

export function criarOpcoesDoBanco(
  ambiente: Pick<
    Ambiente,
    | 'POSTGRES_HOST'
    | 'POSTGRES_PORT'
    | 'POSTGRES_DB'
    | 'POSTGRES_USER'
    | 'POSTGRES_PASSWORD'
  >,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: ambiente.POSTGRES_HOST,
    port: ambiente.POSTGRES_PORT,
    database: ambiente.POSTGRES_DB,
    username: ambiente.POSTGRES_USER,
    password: ambiente.POSTGRES_PASSWORD,
    synchronize: false,
    migrationsRun: true,
    entities: [RegiaoSchema],
    migrations: [CriaRegioes1764000000000],
  };
}
