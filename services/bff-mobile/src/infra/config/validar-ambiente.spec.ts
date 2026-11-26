import { validarAmbiente } from './validar-ambiente';

const completo: Record<string, string> = {
  PORT: '3000',
  KEYCLOAK_ISSUER: 'https://api.pluvia.local/auth/realms/pluvia',
  KEYCLOAK_JWKS_URL:
    'http://keycloak:8080/realms/pluvia/protocol/openid-connect/certs',
  OIDC_AUDIENCE: 'pluvia-bff-web',
};

describe('validarAmbiente', () => {
  it('aceita a configuração completa e converte a porta', () => {
    expect(validarAmbiente(completo)).toEqual({
      ...completo,
      PORT: 3000,
      TERRITORIO_URL: 'http://territorio:3000',
      RISCO_URL: 'http://risco:3000',
      UPSTREAM_TIMEOUT_MS: 2_000,
    });
  });

  it.each(Object.keys(completo))('exige %s', (nome) => {
    const { [nome]: _removida, ...semCampo } = completo;
    expect(() => validarAmbiente(semCampo)).toThrow(nome);
  });

  it.each(['0', '-1', 'abc', '65536'])('rejeita porta inválida %s', (PORT) => {
    expect(() => validarAmbiente({ ...completo, PORT })).toThrow('PORT');
  });

  it('rejeita issuer que não seja uma URL HTTP(S)', () => {
    expect(() => validarAmbiente({ ...completo, KEYCLOAK_ISSUER: 'pluvia' })).toThrow(
      'KEYCLOAK_ISSUER',
    );
  });

  it('valida destinos e timeout configurados por ambiente', () => {
    expect(
      validarAmbiente({ ...completo, RISCO_URL: 'http://risco.local:3100', UPSTREAM_TIMEOUT_MS: '1500' }),
    ).toMatchObject({ RISCO_URL: 'http://risco.local:3100', UPSTREAM_TIMEOUT_MS: 1500 });
    expect(() => validarAmbiente({ ...completo, TERRITORIO_URL: 'javascript:alert(1)' })).toThrow(
      'TERRITORIO_URL',
    );
    expect(() => validarAmbiente({ ...completo, UPSTREAM_TIMEOUT_MS: '-1' })).toThrow(
      'UPSTREAM_TIMEOUT_MS',
    );
  });
});
