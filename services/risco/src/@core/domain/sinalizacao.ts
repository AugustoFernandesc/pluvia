export type NivelAtencao = 'NORMAL' | 'OBSERVACAO' | 'ATENCAO' | 'ALTA_ATENCAO';

/** Do mais grave para o mais leve. É a ordem do painel. */
export const NIVEIS_POR_GRAVIDADE: readonly NivelAtencao[] = [
  'ALTA_ATENCAO',
  'ATENCAO',
  'OBSERVACAO',
  'NORMAL',
];

export type EstadoSinalizacao = 'ABERTA' | 'RECONHECIDA' | 'ENCERRADA';
export type OrigemSinalizacao = 'OBSERVADO' | 'PREVISTO';

export interface Fator {
  tipo: string;
  descricao: string;
  fonte: string;
  referencia?: string;
}

export interface Sinalizacao {
  id: string;
  regiaoId: string;
  origem: OrigemSinalizacao;
  nivelAtencao: NivelAtencao;
  motivo: string;
  fatores: Fator[];
  estado: EstadoSinalizacao;
  emitidaEm: Date;
  reconhecidaPor: string | null;
  reconhecidaEm: Date | null;
  encerradaEm: Date | null;
}

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

export class SinalizacaoNaoEncontrada extends Error {
  constructor(readonly sinalizacaoId: string) {
    super(`Sinalização ${sinalizacaoId} não encontrada.`);
  }
}

export class TransicaoInvalida extends Error {
  constructor(readonly sinalizacaoId: string, readonly estadoAtual: EstadoSinalizacao, acao: string) {
    super(`Não é possível ${acao} a sinalização ${sinalizacaoId}: ela está ${estadoAtual}.`);
  }
}

/** Regra do comando: só uma sinalização ABERTA pode ser reconhecida. */
export function reconhecer(
  sinalizacao: Sinalizacao,
  agora: Date,
  reconhecidaPor: string | null,
): Sinalizacao {
  if (sinalizacao.estado !== 'ABERTA') {
    throw new TransicaoInvalida(sinalizacao.id, sinalizacao.estado, 'reconhecer');
  }
  return { ...sinalizacao, estado: 'RECONHECIDA', reconhecidaEm: agora, reconhecidaPor };
}
