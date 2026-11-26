import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export type ServicoInterno = 'TERRITORIO' | 'RISCO';

export interface RespostaInterna {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

const HEADERS_RETORNO = [
  'content-type',
  'location',
  'etag',
  'cache-control',
  'last-modified',
  'retry-after',
  'x-request-id',
] as const;

@Injectable()
export class ClienteServicosService {
  private readonly urls: Record<ServicoInterno, string>;
  private readonly timeout: number;

  constructor(config: ConfigService) {
    this.urls = {
      TERRITORIO: config.getOrThrow<string>('TERRITORIO_URL'),
      RISCO: config.getOrThrow<string>('RISCO_URL'),
    };
    this.timeout = config.getOrThrow<number>('UPSTREAM_TIMEOUT_MS');
  }

  async requisitar(
    servico: ServicoInterno,
    caminho: string,
    request: Request,
    preservarQuery = false,
  ): Promise<RespostaInterna> {
    const destino = new URL(caminho.replace(/^\/+/, ''), `${this.urls[servico].replace(/\/+$/, '')}/`);
    if (preservarQuery) {
      const query = new URL(request.originalUrl || request.url, 'http://bff.local').searchParams;
      query.forEach((valor, chave) => destino.searchParams.append(chave, valor));
    }
    const headers = new Headers({ accept: request.header('accept') || 'application/json' });
    const requestId = request.header('x-request-id');
    if (requestId) headers.set('x-request-id', requestId);

    try {
      const resposta = await fetch(destino, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeout),
      });
      const respostaHeaders: Record<string, string> = {};
      for (const nome of HEADERS_RETORNO) {
        const valor = resposta.headers.get(nome);
        if (valor !== null) respostaHeaders[nome] = valor;
      }
      return {
        status: resposta.status,
        headers: respostaHeaders,
        body: Buffer.from(await resposta.arrayBuffer()),
      };
    } catch (erro) {
      const expirou =
        erro instanceof Error && (erro.name === 'TimeoutError' || erro.name === 'AbortError');
      const status = expirou ? 504 : 503;
      return {
        status,
        headers: { 'content-type': 'application/problem+json' },
        body: Buffer.from(
          JSON.stringify({
            type: `https://pluvia.dev/problemas/${expirou ? 'timeout' : 'servico-indisponivel'}`,
            title: expirou ? 'Tempo limite excedido' : 'Serviço indisponível',
            status,
            detail: expirou
              ? 'Uma dependência não respondeu dentro do tempo limite configurado.'
              : 'Não foi possível acessar uma dependência necessária para esta operação.',
            instance: request.path,
          }),
        ),
      };
    }
  }

  url(servico: ServicoInterno): string {
    return this.urls[servico];
  }
}

export function jsonInterno<T>(resposta: RespostaInterna): T | undefined {
  if (resposta.body.length === 0) return undefined;
  try {
    return JSON.parse(resposta.body.toString('utf8')) as T;
  } catch {
    return undefined;
  }
}
