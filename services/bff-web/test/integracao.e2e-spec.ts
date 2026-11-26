import request from 'supertest';

import { BffTestContext, startBffForAuthTests } from './jwt-test-support';

const regiaoId = '6f1c2a10-0000-4000-8000-000000000001';
const acaoId = '7a3e5b20-0000-4000-8000-000000000001';
const fetchReal = global.fetch;

describe('BFF Web: contratos integrados com os serviços de domínio', () => {
  let context: BffTestContext;
  let fetchMock: jest.SpyInstance;

  beforeAll(async () => { context = await startBffForAuthTests(); });
  afterAll(async () => { await context?.close(); });
  beforeEach(() => { fetchMock = jest.spyOn(global, 'fetch'); });
  afterEach(() => jest.restoreAllMocks());

  it('protege a região, compõe os dados obrigatórios e marca blocos não disponíveis', async () => {
    const token = await context.signToken(['TECNICO']);
    fetchMock.mockImplementation(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.startsWith('http://127.0.0.1:')) return fetchReal(input);
      if (url === `http://territorio:3000/v1/regioes/${regiaoId}`) {
        return new Response(JSON.stringify({ id: regiaoId, nome: 'Centro', municipio: 'Lavras', uf: 'MG' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === `http://risco:3000/v1/panoramas/${regiaoId}`) {
        return new Response(JSON.stringify({ regiaoId, nivelAtencao: 'ATENCAO', atualizadoEm: '2026-11-26T12:00:00Z', sinalizacoesAbertas: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{"type":"about:blank","title":"Não implementado","status":404}', { status: 404, headers: { 'content-type': 'application/problem+json' } });
    });

    const semJwt = await request(context.app.getHttpServer()).get(`/web/v1/regioes/${regiaoId}`);
    expect(semJwt.status).toBe(401);
    const resposta = await request(context.app.getHttpServer())
      .get(`/web/v1/regioes/${regiaoId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-ID', 'req-region-1');
    expect(resposta.status).toBe(200);
    expect(resposta.body.regiao.nome).toBe('Centro');
    expect(resposta.body.panorama.nivelAtencao).toBe('ATENCAO');
    expect(resposta.body.vulnerabilidade).toBeNull();
    expect(resposta.body.acoes).toBeNull();
    expect(resposta.body.analise).toBeNull();
    expect(resposta.body.avisos).toHaveLength(4);
    expect(resposta.headers['x-request-id']).toBe('req-region-1');
  });

  it('compõe a síntese e as fontes que Análise publica para uma região', async () => {
    const token = await context.signToken(['TECNICO']);
    fetchMock.mockImplementation(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.startsWith('http://127.0.0.1:')) return fetchReal(input);
      if (url === `http://territorio:3000/v1/regioes/${regiaoId}`) {
        return new Response(JSON.stringify({ id: regiaoId, nome: 'Centro', municipio: 'Lavras', uf: 'MG' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === `http://risco:3000/v1/panoramas/${regiaoId}`) {
        return new Response(JSON.stringify({ regiaoId, nivelAtencao: 'ATENCAO', atualizadoEm: '2026-11-26T12:00:00Z', sinalizacoesAbertas: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === 'http://analise:8000/v1/analises') {
        return new Response(JSON.stringify({
          regiaoId,
          tipo: 'SITUACAO_ATUAL',
          sintese: 'Centro merece atenção conforme o panorama publicado.',
          fontes: [{ nome: 'Território', referencia: `GET /v1/regioes/${regiaoId}` }, { nome: 'Risco', referencia: `GET /v1/panoramas/${regiaoId}` }],
          origem: 'FALLBACK',
          modelo: null,
          latenciaMs: 25,
          geradaEm: '2026-11-26T12:00:01Z',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('Não implementado', { status: 404, headers: { 'content-type': 'application/problem+json' } });
    });

    const response = await request(context.app.getHttpServer())
      .get(`/web/v1/regioes/${regiaoId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.analise).toEqual({
      sintese: 'Centro merece atenção conforme o panorama publicado.',
      fontes: expect.arrayContaining([expect.objectContaining({ nome: 'Território' }), expect.objectContaining({ nome: 'Risco' })]),
      origem: 'FALLBACK',
      modelo: null,
      latenciaMs: 25,
      geradaEm: '2026-11-26T12:00:01Z',
    });
    const call = fetchMock.mock.calls.find(([url]) => String(url) === 'http://analise:8000/v1/analises');
    expect(call).toBeDefined();
    const [, init] = call as [URL, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ regiaoId, tipo: 'SITUACAO_ATUAL' });
  });

  it('contabiliza apenas estados conhecidos como ações em andamento', async () => {
    const token = await context.signToken(['GESTOR']);
    fetchMock.mockImplementation(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.startsWith('http://127.0.0.1:')) return fetchReal(input);
      if (url === 'http://risco:3000/v1/panoramas?pagina=1&tamanho=100&municipio=Lavras') {
        return new Response(JSON.stringify({ itens: [{ regiaoId, regiaoNome: 'Centro', nivelAtencao: 'ATENCAO', sinalizacoesAbertas: 0, atualizadoEm: '2026-11-26T12:00:00Z' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === 'http://operacoes:3000/v1/acoes?tamanho=100') {
        return new Response(JSON.stringify({ total: 3, itens: [
          { regiaoId, estado: 'PENDENTE' },
          { regiaoId, estado: 'CONCLUIDA' },
          { regiaoId, estado: 'ESTADO_DESCONHECIDO' },
        ] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(null, { status: 404 });
    });

    const response = await request(context.app.getHttpServer())
      .get('/web/v1/painel?municipio=Lavras')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.regioes[0].acoesAbertas).toBe(1);
    expect(response.body.contadores.acoesEmAndamento).toBe(1);
  });

  it('retorna 403 a perfil incorreto e 400 para identificador de região inválido', async () => {
    const agente = await context.signToken(['AGENTE']);
    expect((await request(context.app.getHttpServer()).get(`/web/v1/regioes/${regiaoId}`).set('Authorization', `Bearer ${agente}`)).status).toBe(403);
    const gestor = await context.signToken(['GESTOR']);
    expect((await request(context.app.getHttpServer()).get('/web/v1/regioes/nao-e-uuid').set('Authorization', `Bearer ${gestor}`)).status).toBe(400);
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).startsWith('http://127.0.0.1:'))).toHaveLength(0);
  });

  it('reescreve links HAL na consulta da ação e não encaminha headers de identidade', async () => {
    const tecnico = await context.signToken(['TECNICO']);
    const resposta = new Response(JSON.stringify({
      id: acaoId,
      estado: 'PENDENTE',
      descricao: 'http://operacoes:3000/v1/acoes/nao-e-um-link',
      _links: {
        self: { href: `http://operacoes:3000/v1/acoes/${acaoId}`, method: 'GET' },
        saga: { href: `/v1/acoes/${acaoId}/saga`, method: 'GET' },
        docs: { href: 'https://example.org/manual', method: 'GET' },
      },
    }), { status: 200, headers: { 'content-type': 'application/hal+json' } });
    fetchMock.mockImplementation((input: URL | RequestInfo) => String(input).startsWith('http://127.0.0.1:') ? fetchReal(input) : Promise.resolve(resposta));

    const response = await request(context.app.getHttpServer())
      .get(`/web/v1/acoes/${acaoId}`)
      .set('Authorization', `Bearer ${tecnico}`)
      .set('X-Profile', 'GESTOR')
      .set('X-Usuario-ID', 'forjado')
      .set('X-Request-ID', 'req-action-1');
    expect(response.status).toBe(200);
    expect(response.body._links.self.href).toBe(`/web/v1/acoes/${acaoId}`);
    expect(response.body._links.saga.href).toBe(`/web/v1/acoes/${acaoId}/saga`);
    expect(response.body._links.docs.href).toBe('https://example.org/manual');
    expect(response.body.descricao).toBe('http://operacoes:3000/v1/acoes/nao-e-um-link');
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const outgoing = new Headers(init.headers);
    expect(outgoing.get('authorization')).toBeNull();
    expect(outgoing.get('x-profile')).toBeNull();
    expect(outgoing.get('x-usuario-id')).toBeNull();
    expect(outgoing.get('x-request-id')).toBe('req-action-1');
  });

  it('envia POST sem retry e preserva Idempotency-Key, JSON de domínio e seu status', async () => {
    const gestor = await context.signToken(['GESTOR']);
    const pedido = { regiaoId, tipo: 'VISTORIA', data: '2026-12-01', turno: 'MANHA', especialidade: 'GERAL', categoriaRecurso: 'KIT_VISTORIA' };
    const resposta = new Response(JSON.stringify({ id: acaoId, estado: 'PENDENTE' }), { status: 202, headers: { 'content-type': 'application/hal+json', location: `/v1/acoes/${acaoId}` } });
    fetchMock.mockImplementation((input: URL | RequestInfo) => String(input).startsWith('http://127.0.0.1:') ? fetchReal(input) : Promise.resolve(resposta));
    const response = await request(context.app.getHttpServer()).post('/web/v1/acoes').set('Authorization', `Bearer ${gestor}`).set('Idempotency-Key', 'idem-demo-01').send(pedido);
    expect(response.status).toBe(202);
    expect(response.body.id).toBe(acaoId);
    expect(response.headers.location).toBe(`/web/v1/acoes/${acaoId}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(new Headers(init.headers).get('idempotency-key')).toBe('idem-demo-01');
    expect(JSON.parse(String(init.body))).toEqual(pedido);
  });

  it('encaminha a pergunta e preserva a indisponibilidade problem+json de Análise', async () => {
    const tecnico = await context.signToken(['TECNICO']);
    const problema = JSON.stringify({ type: 'https://pluvia.dev/problemas/llm-indisponivel', title: 'Provedor de LLM indisponível', status: 503, detail: 'Nenhuma fonte indexada está disponível.' });
    fetchMock.mockImplementation((input: URL | RequestInfo) => String(input).startsWith('http://127.0.0.1:')
      ? fetchReal(input)
      : Promise.resolve(new Response(problema, { status: 503, headers: { 'content-type': 'application/problem+json' } })));

    const pergunta = { pergunta: 'Quais cuidados devem ser avaliados antes de uma chuva intensa?', usarRecuperacao: false };
    const response = await request(context.app.getHttpServer())
      .post('/web/v1/consultas')
      .set('Authorization', `Bearer ${tecnico}`)
      .send(pergunta);
    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toEqual(JSON.parse(problema));
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url) === 'http://analise:8000/v1/consultas') as [URL, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual(pergunta);
    expect(new Headers(init.headers).get('authorization')).toBeNull();
  });

  it('reconhece uma sinalização só com TECNICO e propaga o subject do JWT validado', async () => {
    const sinalizacaoId = '8b4f6c30-0000-4000-8000-000000000001';
    const tecnico = await context.signToken(['TECNICO']);
    const subject = JSON.parse(Buffer.from(tecnico.split('.')[1], 'base64url').toString('utf8')).sub;
    fetchMock.mockImplementation((input: URL | RequestInfo) => String(input).startsWith('http://127.0.0.1:')
      ? fetchReal(input)
      : Promise.resolve(new Response('{"estado":"RECONHECIDA"}', { status: 200, headers: { 'content-type': 'application/json' } })));

    const response = await request(context.app.getHttpServer())
      .post(`/web/v1/sinalizacoes/${sinalizacaoId}/reconhecimento`)
      .set('Authorization', `Bearer ${tecnico}`)
      .set('X-Usuario-ID', 'identidade-forjada');
    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url) === `http://risco:3000/v1/sinalizacoes/${sinalizacaoId}/reconhecimento`) as [URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('x-usuario-id')).toBe(subject);
    expect(headers.get('x-usuario-id')).not.toBe('identidade-forjada');
    expect(headers.get('authorization')).toBeNull();

    const agente = await context.signToken(['AGENTE']);
    expect((await request(context.app.getHttpServer())
      .post(`/web/v1/sinalizacoes/${sinalizacaoId}/reconhecimento`)
      .set('Authorization', `Bearer ${agente}`)).status).toBe(403);
  });
});
