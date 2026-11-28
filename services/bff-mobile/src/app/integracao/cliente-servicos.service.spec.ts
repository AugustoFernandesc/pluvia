import { Request } from 'express';

import { ClienteServicosService } from './cliente-servicos.service';

describe('ClienteServicosService Mobile', () => {
  let cliente: ClienteServicosService;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    cliente = new ClienteServicosService({
      getOrThrow: (nome: string) => ({ TERRITORIO_URL: 'http://territorio:3000', RISCO_URL: 'http://risco:3000', UPSTREAM_TIMEOUT_MS: 2_000 })[nome as 'TERRITORIO_URL' | 'RISCO_URL' | 'UPSTREAM_TIMEOUT_MS'],
    } as never);
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => jest.restoreAllMocks());

  it('preserva request id e filtros sem encaminhar headers fornecidos pelo cliente', async () => {
    fetchMock.mockResolvedValue(new Response('{"itens":[]}', { status: 200 }));
    const req = {
      header: (nome: string) => ({ 'x-request-id': 'req-mobile-1', authorization: 'Bearer segredo', 'x-usuario-id': 'forjado' })[nome.toLowerCase()],
      originalUrl: '/mobile/v1/publico/regioes?municipio=Lavras',
      url: '/mobile/v1/publico/regioes?municipio=Lavras',
    } as unknown as Request;
    await cliente.requisitar('TERRITORIO', 'v1/regioes', req, true);
    const [destino, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(destino.toString()).toBe('http://territorio:3000/v1/regioes?municipio=Lavras');
    expect(headers.get('x-request-id')).toBe('req-mobile-1');
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-usuario-id')).toBeNull();
  });

  it('devolve erros de rede e timeout como problem+json com status explícito', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const req = { header: () => undefined, path: '/mobile/v1/publico/regioes/id/resumo' } as unknown as Request;
    const indisponivel = await cliente.requisitar('RISCO', 'v1/panoramas/id', req);
    expect(indisponivel.status).toBe(503);
    expect(indisponivel.headers['content-type']).toBe('application/problem+json');
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
    const timeout = await cliente.requisitar('TERRITORIO', 'v1/regioes/id', req);
    expect(timeout.status).toBe(504);
    expect(timeout.headers['content-type']).toBe('application/problem+json');
  });
});
