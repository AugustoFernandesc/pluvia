import request from 'supertest';

import { BffTestContext, startBffForAuthTests } from './jwt-test-support';

describe('BFF Mobile: public routes, JWT, roles and path prefix', () => {
  let context: BffTestContext;

  beforeAll(async () => {
    context = await startBffForAuthTests();
  });

  afterAll(async () => {
    await context?.close();
  });

  it('keeps /health public and outside /mobile/v1', async () => {
    const response = await request(context.app.getHttpServer()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect((await request(context.app.getHttpServer()).get('/mobile/v1/health')).status).toBe(404);
  });

  it('serves the technical public route without a token, even with an invalid bearer', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/mobile/v1/publico/_system/status')
      .set('authorization', 'Bearer invalid.token.value');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      component: 'bff-mobile',
      kind: 'technical-check',
      access: 'public',
    });
  });

  it('rejects a missing JWT despite an arbitrary profile header', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/mobile/v1/_system/authorization-check')
      .set('x-profile', 'AGENTE');
    expect(response.status).toBe(401);
  });

  it('rejects a malformed JWT', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/mobile/v1/_system/authorization-check')
      .set('authorization', 'Bearer not.a.jwt');
    expect(response.status).toBe(401);
  });

  it('rejects a correctly signed but expired JWT', async () => {
    const token = await context.signToken(['AGENTE'], -60);
    const response = await request(context.app.getHttpServer())
      .get('/mobile/v1/_system/authorization-check')
      .set('authorization', `Bearer ${token}`);
    expect(response.status).toBe(401);
  });

  it('authorizes AGENTE from the signed realm claim', async () => {
    const token = await context.signToken(['AGENTE']);
    const response = await request(context.app.getHttpServer())
      .get('/mobile/v1/_system/authorization-check')
      .set('authorization', `Bearer ${token}`)
      .set('x-profile', 'GESTOR');
    expect(response.status).toBe(200);
    expect(response.body.roles).toEqual(['AGENTE']);
    expect(response.body.component).toBe('bff-mobile');
  });

  it('returns 403 for an authenticated user without AGENTE', async () => {
    const token = await context.signToken(['GESTOR', 'TECNICO']);
    const response = await request(context.app.getHttpServer())
      .get('/mobile/v1/_system/authorization-check')
      .set('authorization', `Bearer ${token}`)
      .set('x-profile', 'AGENTE');
    expect(response.status).toBe(403);
  });

  it('preserves the /mobile/v1 prefix and not the template /v1 prefix', async () => {
    const token = await context.signToken(['AGENTE']);
    const prefixoCorreto = await request(context.app.getHttpServer())
      .get('/mobile/v1/_system/authorization-check')
      .set('authorization', `Bearer ${token}`);
    const prefixoAntigo = await request(context.app.getHttpServer())
      .get('/v1/_system/authorization-check')
      .set('authorization', `Bearer ${token}`);
    expect(prefixoCorreto.status).toBe(200);
    expect(prefixoAntigo.status).toBe(404);
  });
});
