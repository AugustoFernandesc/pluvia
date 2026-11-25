import { EstadoSinalizacao, NivelAtencao, Pagina } from './sinalizacao';

/** Resumo de uma sinalização dentro do documento do panorama. */
export interface SinalizacaoNoPanorama {
  id: string;
  estado: EstadoSinalizacao;
  nivel?: NivelAtencao;
  reconhecidaEm?: string;
}

/** Conteúdo do JSONB `documento`. Desnormalizado e pronto para exibir. */
export interface DocumentoPanorama {
  fatores: unknown[];
  sinalizacoes: SinalizacaoNoPanorama[];
  [trecho: string]: unknown;
}

/** Uma linha de `panorama_regiao`, no banco de leitura. */
export interface Panorama {
  regiaoId: string;
  regiaoNome: string;
  municipio: string;
  nivelAtencao: NivelAtencao;
  documento: DocumentoPanorama;
  versao: number;
  atualizadoEm: Date;
}

export class PanoramaNaoEncontrado extends Error {
  constructor(readonly regiaoId: string) {
    super(`Panorama da região ${regiaoId} não encontrado.`);
  }
}

export function contarAbertas(documento: DocumentoPanorama): number {
  return (documento.sinalizacoes ?? []).filter((s) => s.estado === 'ABERTA').length;
}

/**
 * Projeção do SinalizacaoReconhecida: troca o estado da sinalização no
 * documento. Não altera o documento recebido.
 */
export function aplicarReconhecimento(
  documento: DocumentoPanorama,
  sinalizacaoId: string,
  reconhecidaEm: string,
): DocumentoPanorama {
  const sinalizacoes = documento.sinalizacoes ?? [];
  const existe = sinalizacoes.some((s) => s.id === sinalizacaoId);
  return {
    ...documento,
    sinalizacoes: existe
      ? sinalizacoes.map((s) =>
          s.id === sinalizacaoId ? { ...s, estado: 'RECONHECIDA' as const, reconhecidaEm } : s,
        )
      : [...sinalizacoes, { id: sinalizacaoId, estado: 'RECONHECIDA', reconhecidaEm }],
  };
}

export interface FiltroPanoramas {
  municipio?: string;
  pagina: number;
  tamanho: number;
}

/** Resultado de aplicar um evento no modelo de leitura. */
export type ResultadoDaProjecao = 'aplicado' | 'repetido' | 'sem-panorama';

export interface RepositorioPanoramas {
  listar(filtro: FiltroPanoramas): Promise<Pagina<Panorama>>;
  obter(regiaoId: string): Promise<Panorama | null>;
  /**
   * Numa transação do banco de leitura: registra o id do evento em
   * mensagens_processadas (se já estava, devolve 'repetido' sem mexer em
   * nada), aplica a mudança no documento da região e soma 1 em `versao`.
   */
  projetar(
    evento: { id: string; tipo: string },
    regiaoId: string,
    mudanca: (documento: DocumentoPanorama) => DocumentoPanorama,
  ): Promise<{ resultado: ResultadoDaProjecao; versao?: number }>;
}

export const REPOSITORIO_PANORAMAS = Symbol('RepositorioPanoramas');
