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
      OPERACOES_URL: 'http://operacoes:3000',
      RISCO_URL: 'http://risco:3000',
      ANALISE_URL: 'http://analise:8000',
      UPSTREAM_TIMEOUT_MS: 2_000,
      ANALISE_TIMEOUT_MS: 120_000,
      ANALISE_SINTESE_TIMEOUT_MS: 30_000,
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

  it('valida e preserva os destinos internos configurados por ambiente', () => {
    expect(
      validarAmbiente({
        ...completo,
        TERRITORIO_URL: 'http://territorio.local:3001',
        UPSTREAM_TIMEOUT_MS: '1500',
      }),
    ).toMatchObject({ TERRITORIO_URL: 'http://territorio.local:3001', UPSTREAM_TIMEOUT_MS: 1500 });
    expect(() => validarAmbiente({ ...completo, RISCO_URL: 'http://user:secret@risco:3000' })).toThrow(
      'RISCO_URL',
    );
    expect(() => validarAmbiente({ ...completo, ANALISE_TIMEOUT_MS: '0' })).toThrow(
      'ANALISE_TIMEOUT_MS',
    );
    expect(() => validarAmbiente({ ...completo, ANALISE_SINTESE_TIMEOUT_MS: '0' })).toThrow(
      'ANALISE_SINTESE_TIMEOUT_MS',
    );
  });
});
