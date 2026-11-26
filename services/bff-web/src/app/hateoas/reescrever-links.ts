/** Reescreve apenas links HAL de Operações para o espaço público do BFF Web. */
export function reescreverLinksHateoas<T>(documento: T, urlOperacoes: string): T {
  const reescreverHref = (href: string) => reescreverUrlOperacoes(href, urlOperacoes);

  function visitar(valor: unknown): unknown {
    if (Array.isArray(valor)) return valor.map(visitar);
    if (!valor || typeof valor !== 'object') return valor;

    const objeto = valor as Record<string, unknown>;
    const novo: Record<string, unknown> = {};
    for (const [chave, conteudo] of Object.entries(objeto)) {
      if ((chave === '_links' || chave === 'links') && conteudo && typeof conteudo === 'object') {
        const links = conteudo as Record<string, unknown>;
        const linksNovos: Record<string, unknown> = {};
        for (const [relacao, link] of Object.entries(links)) {
          if (Array.isArray(link)) {
            linksNovos[relacao] = link.map(reescreverLink);
          } else {
            linksNovos[relacao] = reescreverLink(link);
          }
        }
        novo[chave] = linksNovos;
      } else {
        novo[chave] = visitar(conteudo);
      }
    }
    return novo;
  }

  function reescreverLink(link: unknown): unknown {
    if (!link || typeof link !== 'object' || Array.isArray(link)) return link;
    const objeto = link as Record<string, unknown>;
    if (typeof objeto.href !== 'string') return { ...objeto };
    return { ...objeto, href: reescreverHref(objeto.href) };
  }

  return visitar(documento) as T;
}

export function reescreverUrlOperacoes(href: string, urlOperacoes: string): string {
  let destino: URL;
  try {
    destino = new URL(href, `${urlOperacoes.replace(/\/+$/, '')}/`);
  } catch {
    return href;
  }

  const absoluto = /^https?:\/\//i.test(href);
  if (absoluto && destino.origin !== new URL(urlOperacoes).origin) return href;
  if (destino.pathname !== '/v1/acoes' && !destino.pathname.startsWith('/v1/acoes/')) return href;
  return `/web${destino.pathname}${destino.search}${destino.hash}`;
}
