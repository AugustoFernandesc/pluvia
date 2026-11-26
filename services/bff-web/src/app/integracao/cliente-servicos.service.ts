import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export type ServicoInterno = 'TERRITORIO' | 'OPERACOES' | 'RISCO' | 'ANALISE';

export interface RespostaInterna {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export interface OpcoesRequisicao {
  metodo?: 'GET' | 'POST';
  corpo?: unknown;
  timeoutMs?: number;
  preservarQuery?: boolean;
  idempotencyKey?: boolean;
  usuarioVerificado?: string;
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
  private readonly timeoutPadrao: number;
  private readonly timeoutAnalise: number;
  readonly timeoutAnaliseRegional: number;

  constructor(config: ConfigService) {
    this.urls = {
      TERRITORIO: config.getOrThrow<string>('TERRITORIO_URL'),
      OPERACOES: config.getOrThrow<string>('OPERACOES_URL'),
      RISCO: config.getOrThrow<string>('RISCO_URL'),
      ANALISE: config.getOrThrow<string>('ANALISE_URL'),
    };
    this.timeoutPadrao = config.getOrThrow<number>('UPSTREAM_TIMEOUT_MS');
    this.timeoutAnalise = config.getOrThrow<number>('ANALISE_TIMEOUT_MS');
    this.timeoutAnaliseRegional = config.get<number>(
      'ANALISE_SINTESE_TIMEOUT_MS',
      this.timeoutAnalise,
    );
  }

  url(servico: ServicoInterno): string {
    return this.urls[servico];
  }

  async requisitar(
    servico: ServicoInterno,
    caminho: string,
    request: Request,
    opcoes: OpcoesRequisicao = {},
  ): Promise<RespostaInterna> {
    const destino = new URL(caminho.replace(/^\/+/, ''), `${this.urls[servico].replace(/\/+$/, '')}/`);
    if (opcoes.preservarQuery !== false) {
      const query = new URL(request.originalUrl || request.url, 'http://bff.local').searchParams;
      query.forEach((valor, chave) => destino.searchParams.append(chave, valor));
    }

    const headers = new Headers({ accept: request.header('accept') || 'application/json' });
    const requestId = request.header('x-request-id');
    if (requestId) headers.set('x-request-id', requestId);

    // Forward only the idempotency key that this BFF endpoint explicitly uses.
    // Authorization and all client-controlled identity/profile headers stay local.
    const idempotencyKey = opcoes.idempotencyKey ? request.header('idempotency-key') : undefined;
    if (idempotencyKey) headers.set('idempotency-key', idempotencyKey);
    if (opcoes.usuarioVerificado) headers.set('x-usuario-id', opcoes.usuarioVerificado);

    const init: RequestInit = {
      method: opcoes.metodo ?? 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(
        opcoes.timeoutMs ?? (servico === 'ANALISE' ? this.timeoutAnalise : this.timeoutPadrao),
      ),
    };
    if (opcoes.corpo !== undefined) {
      headers.set('content-type', 'application/json');
      init.body = JSON.stringify(opcoes.corpo);
    }

    try {
      const resposta = await fetch(destino, init);
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
      const titulo = expirou ? 'Tempo limite excedido' : 'Serviço indisponível';
      const detalhe = expirou
        ? 'A dependência não respondeu dentro do tempo limite configurado.'
        : 'Não foi possível acessar uma dependência necessária para esta operação.';
      return {
        status,
        headers: { 'content-type': 'application/problem+json' },
        body: Buffer.from(
          JSON.stringify({
            type: `https://pluvia.dev/problemas/${expirou ? 'timeout' : 'servico-indisponivel'}`,
            title: titulo,
            status,
            detail: detalhe,
            instance: request.path,
          }),
        ),
      };
    }
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
