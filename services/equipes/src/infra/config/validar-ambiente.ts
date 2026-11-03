export interface Ambiente {
  POSTGRES_HOST: string;
  POSTGRES_PORT: number;
  POSTGRES_DB: string;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  PORT: number;
}

const VARIAVEIS_TEXTO = [
  'POSTGRES_HOST',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
] as const;

const VARIAVEIS_PORTA = ['POSTGRES_PORT', 'PORT'] as const;

const ORDEM = [
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
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
