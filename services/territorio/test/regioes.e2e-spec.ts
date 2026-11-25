import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';

import { configurarApp } from '@ioc/configurar-app';

const CENTRO = '6f1c2a10-0000-4000-8000-000000000001';

describe('/v1/regioes (e2e)', () => {
  let banco: StartedPostgreSqlContainer;
  let app: INestApplication;

  beforeAll(async () => {
    banco = await new PostgreSqlContainer('postgis/postgis:17-3.5-alpine').start();
    process.env.POSTGRES_HOST = banco.getHost();
    process.env.POSTGRES_PORT = String(banco.getPort());
    process.env.POSTGRES_DB = banco.getDatabase();
    process.env.POSTGRES_USER = banco.getUsername();
    process.env.POSTGRES_PASSWORD = banco.getPassword();
    process.env.PORT = '3000';

    const { AppModule } = await import('@ioc/app.module');
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await banco?.stop();
  });

  it('lista as regiões semeadas de Lavras pela migração', async () => {
    const resposta = await request(app.getHttpServer()).get('/v1/regioes?uf=mg');

    expect(resposta.status).toBe(200);
    expect(resposta.body.total).toBe(5);
    expect(resposta.body.itens[0]).toMatchObject({ municipio: 'Lavras', uf: 'MG' });
    expect(resposta.body.itens[0].geometria.type).toBe('MultiPolygon');
  });

  it('pagina a listagem', async () => {
    const resposta = await request(app.getHttpServer()).get('/v1/regioes?pagina=2&tamanho=2');

    expect(resposta.body).toMatchObject({ pagina: 2, tamanho: 2, total: 5 });
    expect(resposta.body.itens).toHaveLength(2);
  });

  it('obtém uma região com área calculada a partir da geometria', async () => {
    const resposta = await request(app.getHttpServer()).get(`/v1/regioes/${CENTRO}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.codigo).toBe('LAV-CENTRO');
    expect(resposta.body.caracteristicas.areaKm2).toBeGreaterThan(1);
  });

  it('responde 404 em problem+json para região inexistente', async () => {
    const resposta = await request(app.getHttpServer()).get(
      '/v1/regioes/6f1c2a10-0000-4000-8000-0000000000ff',
    );

    expect(resposta.status).toBe(404);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(resposta.body.status).toBe(404);
  });

  it('responde 400 para id que não é uuid e tamanho acima do limite', async () => {
    const http = request(app.getHttpServer());

    expect((await http.get('/v1/regioes/abc')).status).toBe(400);
    expect((await http.get('/v1/regioes?tamanho=101')).status).toBe(400);
  });
});
