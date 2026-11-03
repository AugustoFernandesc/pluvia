import request from 'supertest';

import { BffTestContext, startBffForAuthTests } from './jwt-test-support';

describe('BFF Web: health, JWT, roles and path prefix', () => {
  let context: BffTestContext;

  beforeAll(async () => {
    context = await startBffForAuthTests();
  });

  afterAll(async () => {
    await context?.close();
  });

  it('keeps /health public and outside /web/v1', async () => {
    const response = await request(context.app.getHttpServer()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect((await request(context.app.getHttpServer()).get('/web/v1/health')).status).toBe(404);
  });

  it('rejects a missing JWT even when the caller supplies a fake profile header', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/web/v1/_system/authorization-check')
      .set('x-profile', 'GESTOR');
    expect(response.status).toBe(401);
  });

  it('rejects a malformed JWT', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/web/v1/_system/authorization-check')
      .set('authorization', 'Bearer not.a.jwt');
    expect(response.status).toBe(401);
  });

  it('rejects a correctly signed but expired JWT', async () => {
    const token = await context.signToken(['GESTOR'], -60);
    const response = await request(context.app.getHttpServer())
      .get('/web/v1/_system/authorization-check')
      .set('authorization', `Bearer ${token}`);
    expect(response.status).toBe(401);
  });

  it.each(['GESTOR', 'TECNICO'])('authorizes Web role %s from the signed realm claim', async (role) => {
    const token = await context.signToken([role]);
    const response = await request(context.app.getHttpServer())
      .get('/web/v1/_system/authorization-check')
      .set('authorization', `Bearer ${token}`)
      .set('x-profile', 'AGENTE');
    expect(response.status).toBe(200);
    expect(response.body.roles).toEqual([role]);
    expect(response.body.component).toBe('bff-web');
    expect(response.body.gatewayRateLimitSubjectHeaderPresent).toBe(false);
  });

  it('enforces a route-specific TECNICO permission', async () => {
    const gestor = await context.signToken(['GESTOR']);
    const tecnico = await context.signToken(['TECNICO']);
    expect(
      (
        await request(context.app.getHttpServer())
          .get('/web/v1/_system/tecnico')
          .set('authorization', `Bearer ${gestor}`)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(context.app.getHttpServer())
          .get('/web/v1/_system/tecnico')
          .set('authorization', `Bearer ${tecnico}`)
      ).status,
    ).toBe(200);
  });

  it('rejects an authenticated role without Web permission', async () => {
    const token = await context.signToken(['AGENTE']);
    const response = await request(context.app.getHttpServer())
      .get('/web/v1/_system/authorization-check')
      .set('authorization', `Bearer ${token}`)
      .set('x-profile', 'GESTOR');
    expect(response.status).toBe(403);
  });

  it('preserves the /web/v1 prefix and does not mount the old /v1 route', async () => {
    const token = await context.signToken(['GESTOR']);
    const prefixoCorreto = await request(context.app.getHttpServer())
      .get('/web/v1/_system/authorization-check')
      .set('authorization', `Bearer ${token}`);
    const prefixoAntigo = await request(context.app.getHttpServer())
      .get('/v1/_system/authorization-check')
      .set('authorization', `Bearer ${token}`);
    expect(prefixoCorreto.status).toBe(200);
    expect(prefixoAntigo.status).toBe(404);
  });
});
