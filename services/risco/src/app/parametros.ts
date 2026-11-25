import { BadRequestException } from '@nestjs/common';

export const TAMANHO_PADRAO = 20;
export const TAMANHO_MAXIMO = 100;

/** Lê um inteiro positivo da query string, como no Território. */
export function inteiro(valor: string | undefined, nome: string, padrao: number, maximo?: number): number {
  if (valor === undefined) return padrao;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || (maximo !== undefined && numero > maximo)) {
    const limite = maximo ? ` e ${maximo}` : '';
    throw new BadRequestException(`${nome} deve ser um inteiro entre 1${limite}.`);
  }
  return numero;
}

/** Aceita só um dos valores do enum, ou nada. */
export function umDe<T extends string>(valor: string | undefined, nome: string, permitidos: readonly T[]): T | undefined {
  if (valor === undefined) return undefined;
  if (!permitidos.includes(valor as T)) {
    throw new BadRequestException(`${nome} deve ser um de: ${permitidos.join(', ')}.`);
  }
  return valor as T;
}
