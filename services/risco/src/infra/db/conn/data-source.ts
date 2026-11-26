import { DataSourceOptions } from 'typeorm';

import { CriaSinalizacoesEOutbox1764100000000 } from '@infra/db/escrita/migrations/1764100000000-CriaSinalizacoesEOutbox';
import { OutboxSchema } from '@infra/db/escrita/repositories/outbox.schema';
import { SinalizacaoSchema } from '@infra/db/escrita/repositories/sinalizacao.schema';
import { CriaPanoramas1764100000001 } from '@infra/db/leitura/migrations/1764100000001-CriaPanoramas';
import { PanoramaSchema } from '@infra/db/leitura/repositories/panorama.schema';

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
  [BANCO_ESCRITA]: {
    entities: [SinalizacaoSchema, OutboxSchema],
    migrations: [CriaSinalizacoesEOutbox1764100000000],
  },
  [BANCO_LEITURA]: {
    entities: [PanoramaSchema],
    migrations: [CriaPanoramas1764100000001],
  },
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
