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
    expect(validarAmbiente(completo)).toEqual({ ...completo, PORT: 3000 });
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
});
