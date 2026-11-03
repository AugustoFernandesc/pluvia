import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';

import { Ambiente } from '@infra/config/validar-ambiente';

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
    entities: [join(__dirname, '..', 'repositories', '**', '*.schema.js')],
    migrations: [join(__dirname, '..', 'migrations', '*.js')],
  };
}
