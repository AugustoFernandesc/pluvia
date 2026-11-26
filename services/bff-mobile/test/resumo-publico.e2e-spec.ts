import request from 'supertest';

import { BffTestContext, startBffForAuthTests } from './jwt-test-support';

const regiaoId = '6f1c2a10-0000-4000-8000-000000000001';
const fetchReal = global.fetch;

describe('BFF Mobile: resumo público com dados de Território e Risco', () => {
  let context: BffTestContext;
  let fetchMock: jest.SpyInstance;

  beforeAll(async () => { context = await startBffForAuthTests(); });
  afterAll(async () => { await context?.close(); });
  beforeEach(() => { fetchMock = jest.spyOn(global, 'fetch'); });
  afterEach(() => jest.restoreAllMocks());

  it('lista regiões e serve um resumo curto sem JWT, com ETag para revalidação', async () => {
    fetchMock.mockImplementation(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.startsWith('http://127.0.0.1:')) return fetchReal(input);
      if (url === 'http://territorio:3000/v1/regioes?pagina=1&tamanho=100&municipio=Lavras') {
        return new Response(JSON.stringify({ itens: [{ id: regiaoId, nome: 'Centro', geometria: { type: 'MultiPolygon', coordinates: [] } }], pagina: 1, tamanho: 100, total: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === `http://territorio:3000/v1/regioes/${regiaoId}`) {
        return new Response(JSON.stringify({ id: regiaoId, nome: 'Centro', municipio: 'Lavras', atualizadaEm: '2026-11-26T12:00:00Z' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === `http://risco:3000/v1/panoramas/${regiaoId}`) {
        return new Response(JSON.stringify({ regiaoId, regiaoNome: 'Centro', nivelAtencao: 'ATENCAO', chuva: { percentilLocal72h: 91 }, fatores: [{ fonte: 'CEMADEN' }], atualizadoEm: '2026-11-26T12:02:00Z', versao: 2 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    const listagem = await request(context.app.getHttpServer()).get('/mobile/v1/publico/regioes?municipio=Lavras');
    expect(listagem.status).toBe(200);
    expect(listagem.body.itens).toEqual([{ id: regiaoId, nome: 'Centro' }]);
    expect(JSON.stringify(listagem.body)).not.toContain('geometria');

    const resumo = await request(context.app.getHttpServer()).get(`/mobile/v1/publico/regioes/${regiaoId}/resumo`);
    expect(resumo.status).toBe(200);
    expect(resumo.body).toEqual({
      regiao: 'Centro', nivel: 'ATENCAO', rotulo: 'Atenção', cor: '#C65D12',
      mensagem: expect.stringContaining('merece atenção'), atualizadoEm: '2026-11-26T12:02:00Z',
    });
    expect(resumo.headers.etag).toBeDefined();
    expect(JSON.stringify(resumo.body)).not.toMatch(/percentil|geometria|vulnerabilidade|equipe|fatores/i);
    const revalidado = await request(context.app.getHttpServer()).get(`/mobile/v1/publico/regioes/${regiaoId}/resumo`).set('If-None-Match', resumo.headers.etag);
    expect(revalidado.status).toBe(304);
  });

  it('retorna indisponibilidade como 503 problem+json e preserva autenticação nas rotas privadas', async () => {
    fetchMock.mockImplementation((input: URL | RequestInfo) => String(input).startsWith('http://127.0.0.1:')
      ? fetchReal(input)
      : Promise.reject(new TypeError('fetch failed')));
    const resumo = await request(context.app.getHttpServer()).get(`/mobile/v1/publico/regioes/${regiaoId}/resumo`);
    expect(resumo.status).toBe(503);
    expect(resumo.headers['content-type']).toContain('application/problem+json');
    expect(resumo.body.status).toBe(503);

    const privateRoute = await request(context.app.getHttpServer()).get('/mobile/v1/_system/authorization-check');
    expect(privateRoute.status).toBe(401);
  });

  it('conserva 503 no resumo público quando uma dependência essencial estoura o timeout', async () => {
    fetchMock.mockImplementation((input: URL | RequestInfo) => {
      const url = String(input);
      if (url.startsWith('http://127.0.0.1:')) return fetchReal(input);
      if (url.startsWith('http://territorio:3000/')) {
        return Promise.reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
      }
      if (url.startsWith('http://risco:3000/')) {
        return Promise.resolve(new Response(JSON.stringify({ regiaoId, nivelAtencao: 'ATENCAO' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    const resumo = await request(context.app.getHttpServer()).get(`/mobile/v1/publico/regioes/${regiaoId}/resumo`);
    expect(resumo.status).toBe(503);
    expect(resumo.headers['content-type']).toContain('application/problem+json');
    expect(resumo.body.status).toBe(503);
  });

  it('devolve 502 se os dados reais não sustentam um resumo público', async () => {
    fetchMock.mockImplementation(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.startsWith('http://127.0.0.1:')) return fetchReal(input);
      return new Response(JSON.stringify(url.includes('territorio')
        ? { id: regiaoId, nome: 'Centro' }
        : { nivelAtencao: 'NORMAL' }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const response = await request(context.app.getHttpServer()).get(`/mobile/v1/publico/regioes/${regiaoId}/resumo`);
    expect(response.status).toBe(502);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });
});
