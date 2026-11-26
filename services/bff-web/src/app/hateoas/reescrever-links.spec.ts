import { reescreverLinksHateoas, reescreverUrlOperacoes } from './reescrever-links';

describe('reescreverLinksHateoas', () => {
  const base = 'http://operacoes:3000';

  it('reescreve links absolutos e relativos de ações preservando relação, método e query', () => {
    const entrada = {
      id: 'acao-1',
      _links: {
        self: { href: 'http://operacoes:3000/v1/acoes/acao-1', method: 'GET' },
        saga: { href: '/v1/acoes/acao-1/saga?detalhe=true', method: 'GET' },
        cancelar: { href: '/v1/acoes/acao-1/cancelamento', method: 'POST' },
      },
    };

    expect(reescreverLinksHateoas(entrada, base)).toEqual({
      id: 'acao-1',
      _links: {
        self: { href: '/web/v1/acoes/acao-1', method: 'GET' },
        saga: { href: '/web/v1/acoes/acao-1/saga?detalhe=true', method: 'GET' },
        cancelar: { href: '/web/v1/acoes/acao-1/cancelamento', method: 'POST' },
      },
    });
  });

  it('preserva links externos, links de outro domínio e strings fora de coleções HAL', () => {
    const entrada = {
      descricao: 'http://operacoes:3000/v1/acoes/acao-1',
      _links: {
        externo: { href: 'https://example.org/v1/acoes/acao-1', method: 'GET' },
        monitoramento: { href: 'http://monitoramento:3000/v1/leituras', method: 'GET' },
      },
    };

    expect(reescreverLinksHateoas(entrada, base)).toEqual(entrada);
  });

  it('preserva rotas com prefixo semelhante que não pertencem a ações', () => {
    expect(reescreverUrlOperacoes('/v1/acoes-legadas/1', base)).toBe('/v1/acoes-legadas/1');
    expect(reescreverUrlOperacoes('/v1/acoesmaliciosa', base)).toBe('/v1/acoesmaliciosa');
  });

  it('reescreve coleções HAL aninhadas sem alterar dados da ação', () => {
    const entrada = {
      _embedded: {
        acao: {
          id: 'acao-2',
          links: { self: { href: '/v1/acoes/acao-2', method: 'GET' } },
        },
      },
    };

    expect(reescreverLinksHateoas(entrada, base)).toEqual({
      _embedded: {
        acao: {
          id: 'acao-2',
          links: { self: { href: '/web/v1/acoes/acao-2', method: 'GET' } },
        },
      },
    });
  });
});
