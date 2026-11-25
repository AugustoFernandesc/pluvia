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

interface ConteudoDoBanco {
  entities: NonNullable<DataSourceOptions['entities']>;
  migrations: NonNullable<DataSourceOptions['migrations']>;
}

/**
 * Cada banco tem a própria lista de entidades e de migrations, em
 * `infra/db/escrita` e `infra/db/leitura`. Uma entidade do modelo de escrita
 * nunca é carregada na conexão de leitura, e vice-versa.
 *
 * As listas são explícitas, e não um glob de `*.js`, como no Território:
 * o glob não acha nada quando o código roda pelo ts-jest, e os testes
 * ficavam sem tabelas.
 */
const CONTEUDO: Record<NomeDoBanco, ConteudoDoBanco> = {
  [BANCO_ESCRITA]: { entities: [], migrations: [] },
  [BANCO_LEITURA]: { entities: [], migrations: [] },
};

export function criarOpcoesDoBanco(
  nome: NomeDoBanco,
  conexao: ConexaoDoBanco,
): DataSourceOptions {
  return {
    type: 'postgres',
    name: nome,
    ...conexao,
    synchronize: false,
    migrationsRun: true,
    entities: CONTEUDO[nome].entities,
    migrations: CONTEUDO[nome].migrations,
  };
}
