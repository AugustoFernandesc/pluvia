import { DataSourceOptions } from 'typeorm';

import { Ambiente } from '@infra/config/validar-ambiente';
import { CriaEquipesEReservas1764200000000 } from '@infra/db/migrations/1764200000000-CriaEquipesEReservas';

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
    // Os repositórios usam SQL direto, sem entidades mapeadas.
    entities: [],
    migrations: [CriaEquipesEReservas1764200000000],
  };
}
