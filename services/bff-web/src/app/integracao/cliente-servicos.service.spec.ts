import { Request } from 'express';

import { ClienteServicosService } from './cliente-servicos.service';

const ambiente = {
  TERRITORIO_URL: 'http://territorio:3000',
  OPERACOES_URL: 'http://operacoes:3000',
  RISCO_URL: 'http://risco:3000',
  ANALISE_URL: 'http://analise:8000',
  UPSTREAM_TIMEOUT_MS: 2_000,
  ANALISE_TIMEOUT_MS: 120_000,
  ANALISE_SINTESE_TIMEOUT_MS: 30_000,
};

function request(headers: Record<string, string> = {}, originalUrl = '/web/v1/acoes?estado=PENDENTE'): Request {
  return {
    header: (nome: string) => headers[nome.toLowerCase()],
    originalUrl,
    url: originalUrl,
    path: originalUrl.split('?')[0],
  } as unknown as Request;
}

describe('ClienteServicosService Web', () => {
  let cliente: ClienteServicosService;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    cliente = new ClienteServicosService({
      getOrThrow: (nome: string) => ambiente[nome as keyof typeof ambiente],
      get: (nome: string, padrao: number) => ambiente[nome as keyof typeof ambiente] ?? padrao,
    } as never);
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => jest.restoreAllMocks());

  it('preserva query, request id e Idempotency-Key, sem encaminhar bearer ou identidade do cliente', async () => {
    fetchMock.mockResolvedValue(new Response('{"itens":[]}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await cliente.requisitar('OPERACOES', 'v1/acoes', request({
      accept: 'application/hal+json',
      authorization: 'Bearer segredo-do-cliente',
      'x-request-id': 'req-123',
      'x-profile': 'GESTOR',
      'x-usuario-id': 'uuid-forjado',
      'idempotency-key': 'idempotencia-abc',
    }), { idempotencyKey: true });

    const [destino, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(destino.toString()).toBe('http://operacoes:3000/v1/acoes?estado=PENDENTE');
    expect(headers.get('x-request-id')).toBe('req-123');
    expect(headers.get('idempotency-key')).toBe('idempotencia-abc');
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-profile')).toBeNull();
    expect(headers.get('x-usuario-id')).toBeNull();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('passa apenas a identidade verificada explicitamente para um serviço de domínio', async () => {
    fetchMock.mockResolvedValue(new Response('{"estado":"RECONHECIDA"}', { status: 200 }));
    await cliente.requisitar('RISCO', 'v1/sinalizacoes/id/reconhecimento', request({ 'x-usuario-id': 'forjado' }), {
      metodo: 'POST',
      usuarioVerificado: 'subject-verificado',
      preservarQuery: false,
    });
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(new Headers(init.headers).get('x-usuario-id')).toBe('subject-verificado');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('preserva status e corpo problem+json emitido pelo serviço de domínio', async () => {
    const problema = '{"type":"https://pluvia.dev/problemas/conflito","status":409,"title":"Conflito"}';
    fetchMock.mockResolvedValue(new Response(problema, { status: 409, headers: { 'content-type': 'application/problem+json' } }));
    const resposta = await cliente.requisitar('OPERACOES', 'v1/acoes/id', request());
    expect(resposta.status).toBe(409);
    expect(resposta.headers['content-type']).toBe('application/problem+json');
    expect(resposta.body.toString()).toBe(problema);
  });

  it('converte timeout em 504 problem+json e indisponibilidade de rede em 503', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
    const timeout = await cliente.requisitar('ANALISE', 'v1/consultas', request(), { metodo: 'POST', corpo: { pergunta: 'teste' } });
    expect(timeout.status).toBe(504);
    expect(timeout.headers['content-type']).toBe('application/problem+json');
    expect(JSON.parse(timeout.body.toString()).instance).toBe('/web/v1/acoes');

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const indisponivel = await cliente.requisitar('RISCO', 'v1/panoramas/id', request());
    expect(indisponivel.status).toBe(503);
    expect(indisponivel.headers['content-type']).toBe('application/problem+json');
  });
});
