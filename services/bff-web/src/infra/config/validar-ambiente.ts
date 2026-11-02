export interface AmbienteBff {
  PORT: number;
  KEYCLOAK_ISSUER: string;
  KEYCLOAK_JWKS_URL: string;
  OIDC_AUDIENCE: string;
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

  return {
    PORT: Number(porta),
    KEYCLOAK_ISSUER: config.KEYCLOAK_ISSUER as string,
    KEYCLOAK_JWKS_URL: config.KEYCLOAK_JWKS_URL as string,
    OIDC_AUDIENCE: config.OIDC_AUDIENCE as string,
  };
}
