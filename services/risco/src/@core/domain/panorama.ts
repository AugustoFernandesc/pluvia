import { EstadoSinalizacao, NivelAtencao } from './sinalizacao';

/** Resumo de uma sinalização dentro do documento do panorama. */
export interface SinalizacaoNoPanorama {
  id: string;
  estado: EstadoSinalizacao;
  nivel: NivelAtencao;
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
