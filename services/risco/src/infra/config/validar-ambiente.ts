/**
 * O Risco aplica CQRS com duas instâncias de PostgreSQL: a de escrita
 * (normalizada, com as regras de sinalização) e a de leitura (panorama em
 * JSONB). Cada uma tem host, banco, usuário e senha próprios, por isso as
 * variáveis levam o prefixo POSTGRES_ESCRITA_ ou POSTGRES_LEITURA_.
 */
export interface Ambiente {
  POSTGRES_ESCRITA_HOST: string;
  POSTGRES_ESCRITA_PORT: number;
  POSTGRES_ESCRITA_DB: string;
  POSTGRES_ESCRITA_USER: string;
  POSTGRES_ESCRITA_PASSWORD: string;
  POSTGRES_LEITURA_HOST: string;
  POSTGRES_LEITURA_PORT: number;
  POSTGRES_LEITURA_DB: string;
  POSTGRES_LEITURA_USER: string;
  POSTGRES_LEITURA_PASSWORD: string;
  PORT: number;
}

const VARIAVEIS_TEXTO = [
  'POSTGRES_ESCRITA_HOST',
  'POSTGRES_ESCRITA_DB',
  'POSTGRES_ESCRITA_USER',
  'POSTGRES_ESCRITA_PASSWORD',
  'POSTGRES_LEITURA_HOST',
  'POSTGRES_LEITURA_DB',
  'POSTGRES_LEITURA_USER',
  'POSTGRES_LEITURA_PASSWORD',
] as const;

const VARIAVEIS_PORTA = [
  'POSTGRES_ESCRITA_PORT',
  'POSTGRES_LEITURA_PORT',
  'PORT',
] as const;

const ORDEM = [
  'POSTGRES_ESCRITA_HOST',
  'POSTGRES_ESCRITA_PORT',
  'POSTGRES_ESCRITA_DB',
  'POSTGRES_ESCRITA_USER',
  'POSTGRES_ESCRITA_PASSWORD',
  'POSTGRES_LEITURA_HOST',
  'POSTGRES_LEITURA_PORT',
  'POSTGRES_LEITURA_DB',
  'POSTGRES_LEITURA_USER',
  'POSTGRES_LEITURA_PASSWORD',
  'PORT',
] as const;

function ehPortaValida(valor: string): boolean {
  if (!/^\d+$/.test(valor)) return false;
  const numero = Number(valor);
  return numero >= 1 && numero <= 65535;
}

export function validarAmbiente(config: Record<string, unknown>): Ambiente {
  const texto = (nome: string): string | undefined => {
    const valor = config[nome];
    return typeof valor === 'string' && valor !== '' ? valor : undefined;
  };

  const ausentes = ORDEM.filter((nome) => texto(nome) === undefined);
  if (ausentes.length > 0) {
    throw new Error(
      `Variáveis de ambiente ausentes: ${ausentes.join(', ')}`,
    );
  }

  const invalidas = VARIAVEIS_PORTA.filter(
    (nome) => !ehPortaValida(texto(nome) as string),
  );
  if (invalidas.length > 0) {
    throw new Error(
      `Variáveis de ambiente com porta inválida (esperado inteiro de 1 a 65535): ${invalidas.join(', ')}`,
    );
  }

  const ambiente = {} as Record<string, string | number>;
  for (const nome of VARIAVEIS_TEXTO) ambiente[nome] = texto(nome) as string;
  for (const nome of VARIAVEIS_PORTA) ambiente[nome] = Number(texto(nome));
  return ambiente as unknown as Ambiente;
}
