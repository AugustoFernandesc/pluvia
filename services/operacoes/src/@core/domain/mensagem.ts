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

/** Mensagem que nunca vai poder ser processada. Não adianta tentar de novo. */
export class MensagemInvalida extends Error {}

export function criarEnvelope(
  origem: string,
  tipo: string,
  dados: object,
  correlationId: string,
  causationId: string | null = null,
): Envelope {
  return {
    id: randomUUID(),
    tipo,
    versao: 1,
    origem,
    ocorridoEm: new Date().toISOString(),
    correlationId,
    causationId,
    dados: dados as Record<string, unknown>,
  };
}

export function texto(dados: Record<string, unknown>, campo: string): string {
  const valor = dados[campo];
  if (typeof valor !== 'string' || valor === '') {
    throw new MensagemInvalida(`Campo ${campo} ausente ou inválido.`);
  }
  return valor;
}
