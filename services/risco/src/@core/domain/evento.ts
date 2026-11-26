import { randomUUID } from 'crypto';

/** Envelope padrão de docs/arquitetura/08-eventos.md. */
export interface Envelope<D = Record<string, unknown>> {
  id: string;
  tipo: string;
  versao: number;
  origem: string;
  ocorridoEm: string;
  correlationId: string;
  causationId: string | null;
  dados: D;
}

/** Um evento pronto para a outbox: a chave de roteamento e o envelope. */
export interface EventoParaPublicar {
  routingKey: string;
  envelope: Envelope;
}

export function criarEnvelope<D extends Record<string, unknown>>(
  tipo: string,
  dados: D,
  ocorridoEm: Date,
  correlationId?: string,
): Envelope<D> {
  return {
    id: randomUUID(),
    tipo,
    versao: 1,
    origem: 'risco',
    ocorridoEm: ocorridoEm.toISOString(),
    correlationId: correlationId ?? randomUUID(),
    causationId: null,
    dados,
  };
}
