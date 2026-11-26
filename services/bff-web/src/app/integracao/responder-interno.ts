import { Response } from 'express';

import { RespostaInterna } from './cliente-servicos.service';

export function enviarRespostaInterna(
  response: Response,
  upstream: RespostaInterna,
  corpo: Buffer = upstream.body,
  requestId?: string,
): Response {
  response.status(upstream.status);
  for (const [nome, valor] of Object.entries(upstream.headers)) {
    response.setHeader(nome, valor);
  }
  if (requestId) response.setHeader('X-Request-ID', requestId);
  if (upstream.status === 204 || upstream.status === 304 || corpo.length === 0) {
    return response.end();
  }
  return response.send(corpo);
}

export function problemaInterno(
  response: Response,
  status: number,
  titulo: string,
  detalhe: string,
  instancia: string,
  requestId?: string,
): Response {
  response.status(status).type('application/problem+json');
  if (requestId) response.setHeader('X-Request-ID', requestId);
  return response.send({
    type: `https://pluvia.dev/problemas/${status}`,
    title: titulo,
    status,
    detail: detalhe,
    instance: instancia,
  });
}
