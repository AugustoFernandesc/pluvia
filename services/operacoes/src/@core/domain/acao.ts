export const TURNOS = ['MANHA', 'TARDE', 'NOITE'] as const;
export type Turno = (typeof TURNOS)[number];

export const TIPOS_ACAO = ['VISTORIA', 'LIMPEZA_DRENAGEM', 'DESOBSTRUCAO', 'INSPECAO_PONTO_CRITICO'] as const;
export type TipoAcao = (typeof TIPOS_ACAO)[number];

export const ESPECIALIDADES = ['DRENAGEM', 'VISTORIA', 'DESOBSTRUCAO', 'GERAL'] as const;
export type Especialidade = (typeof ESPECIALIDADES)[number];

export const CATEGORIAS = [
  'CAMINHAO_HIDROJATO',
  'RETROESCAVADEIRA',
  'CAMINHONETE',
  'BOMBA_SUCCAO',
  'KIT_VISTORIA',
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const ESTADOS_ACAO = ['PENDENTE', 'CONFIRMADA', 'REJEITADA', 'EM_EXECUCAO', 'CONCLUIDA', 'CANCELADA'] as const;
export type EstadoAcao = (typeof ESTADOS_ACAO)[number];

export interface NovaAcao {
  regiaoId: string;
  sinalizacaoId: string | null;
  tipo: TipoAcao;
  descricao: string | null;
  data: string;
  turno: Turno;
  especialidade: Especialidade;
  equipeId: string | null;
  categoriaRecurso: Categoria;
}

export interface Acao {
  id: string;
  regiaoId: string;
  sinalizacaoId: string | null;
  tipo: TipoAcao;
  descricao: string | null;
  data: string;
  turno: Turno;
  especialidade: Especialidade;
  categoriaRecurso: Categoria;
  /** Equipe pedida na abertura, quando o solicitante escolheu uma. */
  equipeSolicitadaId: string | null;
  estado: EstadoAcao;
  equipeId: string | null;
  recursoId: string | null;
  motivoRejeicao: string | null;
  motivoCancelamento: string | null;
  criadaEm: string;
  atualizadaEm: string;
}

export interface Link {
  href: string;
  method?: 'GET' | 'POST';
  title?: string;
}

export class AcaoNaoEncontrada extends Error {
  constructor(readonly acaoId: string) {
    super(`Ação ${acaoId} não encontrada.`);
  }
}

/** Transição pedida não vale no estado atual da ação (409). */
export class TransicaoInvalida extends Error {}

/** Requisição bem formada, mas contra uma regra de negócio (422). */
export class AcaoNaoProcessavel extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID.test(valor);
}

export function ehData(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor));
}

function de<T extends string>(lista: readonly T[], valor: unknown): valor is T {
  return typeof valor === 'string' && (lista as readonly string[]).includes(valor);
}

export const ehTurno = (v: unknown): v is Turno => de(TURNOS, v);
export const ehTipoAcao = (v: unknown): v is TipoAcao => de(TIPOS_ACAO, v);
export const ehEspecialidade = (v: unknown): v is Especialidade => de(ESPECIALIDADES, v);
export const ehCategoria = (v: unknown): v is Categoria => de(CATEGORIAS, v);
export const ehEstadoAcao = (v: unknown): v is EstadoAcao => de(ESTADOS_ACAO, v);

/**
 * Valida o corpo de POST /v1/acoes. Devolve a ação nova ou a lista de
 * problemas encontrados, para responder 400 de uma vez só.
 */
export function lerNovaAcao(corpo: unknown): NovaAcao | string[] {
  const c = (typeof corpo === 'object' && corpo !== null ? corpo : {}) as Record<string, unknown>;
  const erros: string[] = [];
  if (!ehUuid(c.regiaoId)) erros.push('regiaoId deve ser um UUID.');
  if (c.sinalizacaoId != null && !ehUuid(c.sinalizacaoId)) erros.push('sinalizacaoId deve ser um UUID.');
  if (!ehTipoAcao(c.tipo)) erros.push(`tipo deve ser um de ${TIPOS_ACAO.join(', ')}.`);
  if (c.descricao != null && (typeof c.descricao !== 'string' || c.descricao.length > 500)) {
    erros.push('descricao deve ser texto de até 500 caracteres.');
  }
  if (!ehData(c.data)) erros.push('data deve estar no formato AAAA-MM-DD.');
  if (!ehTurno(c.turno)) erros.push(`turno deve ser um de ${TURNOS.join(', ')}.`);
  if (!ehEspecialidade(c.especialidade)) erros.push(`especialidade deve ser uma de ${ESPECIALIDADES.join(', ')}.`);
  if (c.equipeId != null && !ehUuid(c.equipeId)) erros.push('equipeId deve ser um UUID.');
  if (!ehCategoria(c.categoriaRecurso)) erros.push(`categoriaRecurso deve ser uma de ${CATEGORIAS.join(', ')}.`);
  if (erros.length > 0) return erros;
  return {
    regiaoId: c.regiaoId as string,
    sinalizacaoId: (c.sinalizacaoId as string | undefined) ?? null,
    tipo: c.tipo as TipoAcao,
    descricao: (c.descricao as string | undefined) ?? null,
    data: c.data as string,
    turno: c.turno as Turno,
    especialidade: c.especialidade as Especialidade,
    equipeId: (c.equipeId as string | undefined) ?? null,
    categoriaRecurso: c.categoriaRecurso as Categoria,
  };
}

/** Hoje no fuso de Lavras/MG, como AAAA-MM-DD. */
export function hojeEmLavras(agora = new Date()): string {
  return new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Links HAL da ação. Variam com o estado: enquanto a ação está PENDENTE (SAGA
 * em curso) não há transição nenhuma, que é o bloqueio semântico do 06-saga.md.
 */
export function linksDaAcao(acao: Acao): Record<string, Link> {
  const self = `/v1/acoes/${acao.id}`;
  const links: Record<string, Link> = {
    self: { href: self },
    regiao: { href: `/v1/regioes/${acao.regiaoId}` },
    saga: { href: `${self}/saga` },
  };
  if (acao.estado === 'CONFIRMADA') {
    links.cancelar = { href: `${self}/cancelamento`, method: 'POST', title: 'Cancelar a ação confirmada' };
  }
  return links;
}

export function representar(acao: Acao) {
  const { equipeSolicitadaId: _pedida, ...resto } = acao;
  return { ...resto, _links: linksDaAcao(acao) };
}
