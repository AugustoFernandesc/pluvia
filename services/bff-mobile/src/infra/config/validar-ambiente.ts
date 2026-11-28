export interface AmbienteBff {
  PORT: number;
  KEYCLOAK_ISSUER: string;
  KEYCLOAK_JWKS_URL: string;
  OIDC_AUDIENCE: string;
  TERRITORIO_URL: string;
  RISCO_URL: string;
  UPSTREAM_TIMEOUT_MS: number;
}

const TEXTO_OBRIGATORIO = [
  'KEYCLOAK_ISSUER',
  'KEYCLOAK_JWKS_URL',
  'OIDC_AUDIENCE',
] as const;

function ehUrlHttp(valor: string): boolean {
  try {
    const url = new URL(valor);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname !== '' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

function portaValida(valor: string): boolean {
  if (!/^\d+$/.test(valor)) return false;
  const porta = Number(valor);
  return porta >= 1 && porta <= 65535;
}

function inteiroPositivo(config: Record<string, unknown>, nome: string, padrao: number): number {
  const valor = config[nome] === undefined ? String(padrao) : config[nome];
  if (typeof valor !== 'string' || !/^\d+$/.test(valor) || Number(valor) < 1) {
    throw new Error(`Variável ${nome} inválida (esperado inteiro positivo).`);
  }
  return Number(valor);
}

export function validarAmbiente(config: Record<string, unknown>): AmbienteBff {
  const ausentes = TEXTO_OBRIGATORIO.filter(
    (nome) => typeof config[nome] !== 'string' || config[nome] === '',
  );
  if (ausentes.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${ausentes.join(', ')}`);
  }

  const porta = config.PORT;
  if (typeof porta !== 'string' || !portaValida(porta)) {
    throw new Error('Variável PORT inválida (esperado inteiro de 1 a 65535).');
  }

  for (const nome of ['KEYCLOAK_ISSUER', 'KEYCLOAK_JWKS_URL'] as const) {
    if (!ehUrlHttp(config[nome] as string)) {
      throw new Error(`Variável ${nome} deve ser uma URL HTTP(S) válida.`);
    }
  }

  const urls = {
    TERRITORIO_URL: 'http://territorio:3000',
    RISCO_URL: 'http://risco:3000',
  };
  for (const [nome, padrao] of Object.entries(urls)) {
    const valor = config[nome] === undefined ? padrao : config[nome];
    if (typeof valor !== 'string' || !ehUrlHttp(valor)) {
      throw new Error(`Variável ${nome} deve ser uma URL HTTP(S) válida.`);
    }
    urls[nome as keyof typeof urls] = valor;
  }

  return {
    PORT: Number(porta),
    KEYCLOAK_ISSUER: config.KEYCLOAK_ISSUER as string,
    KEYCLOAK_JWKS_URL: config.KEYCLOAK_JWKS_URL as string,
    OIDC_AUDIENCE: config.OIDC_AUDIENCE as string,
    ...urls,
    UPSTREAM_TIMEOUT_MS: inteiroPositivo(config, 'UPSTREAM_TIMEOUT_MS', 2_000),
  };
}
