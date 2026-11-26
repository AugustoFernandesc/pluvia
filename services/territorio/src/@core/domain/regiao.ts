export type TipoOcupacao =
  | 'RESIDENCIAL'
  | 'COMERCIAL'
  | 'MISTA'
  | 'INDUSTRIAL'
  | 'RURAL';

export interface Poligono {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: unknown[];
}

export interface Caracteristicas {
  areaKm2?: number;
  proximidadeCursoAgua?: boolean;
  declividadeMediaPct?: number;
  tipoOcupacao?: TipoOcupacao;
}

export interface Regiao {
  id: string;
  codigo: string;
  nome: string;
  municipio: string;
  uf: string;
  geometria: Poligono;
  caracteristicas: Caracteristicas | null;
  criadaEm: Date;
  atualizadaEm: Date;
}

export interface FiltroRegioes {
  municipio?: string;
  uf?: string;
  pagina: number;
  tamanho: number;
}

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

export interface RepositorioRegioes {
  listar(filtro: FiltroRegioes): Promise<Pagina<Regiao>>;
  obter(id: string): Promise<Regiao | null>;
}

export const REPOSITORIO_REGIOES = Symbol('RepositorioRegioes');

export class RegiaoNaoEncontrada extends Error {
  constructor(readonly regiaoId: string) {
    super(`Região ${regiaoId} não encontrada.`);
  }
}
