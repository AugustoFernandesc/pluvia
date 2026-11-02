import { join } from 'path';
import { DataSourceOptions } from 'typeorm';

/**
 * Nome de cada conexão do TypeORM. É o mesmo nome usado em
 * `@InjectDataSource(...)` e como chave no corpo do `/health`.
 */
export const BANCO_ESCRITA = 'escrita';
export const BANCO_LEITURA = 'leitura';

export type NomeDoBanco = typeof BANCO_ESCRITA | typeof BANCO_LEITURA;

export interface ConexaoDoBanco {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

/**
 * Cada banco tem as próprias entidades e migrations, em
 * `infra/db/escrita` e `infra/db/leitura`. Uma entidade do modelo de escrita
 * nunca é carregada na conexão de leitura, e vice-versa.
 */
export function criarOpcoesDoBanco(
  nome: NomeDoBanco,
  conexao: ConexaoDoBanco,
): DataSourceOptions {
  const pasta = join(__dirname, '..', nome);
  return {
    type: 'postgres',
    name: nome,
    ...conexao,
    synchronize: false,
    entities: [join(pasta, 'repositories', '**', '*.schema.js')],
    migrations: [join(pasta, 'migrations', '*.js')],
  };
}
