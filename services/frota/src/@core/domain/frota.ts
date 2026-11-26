export const TURNOS = ['MANHA', 'TARDE', 'NOITE'] as const;
export type Turno = (typeof TURNOS)[number];

export const CATEGORIAS = [
  'CAMINHAO_HIDROJATO',
  'RETROESCAVADEIRA',
  'CAMINHONETE',
  'BOMBA_SUCCAO',
  'KIT_VISTORIA',
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

/**
 * PROVISORIA enquanto a SAGA não termina, CONFIRMADA depois de
 * AcaoPreventivaConfirmada, CANCELADA por compensação ou cancelamento da ação.
 */
export type EstadoReserva = 'PROVISORIA' | 'CONFIRMADA' | 'CANCELADA';

/** Estados em que a reserva ocupa o turno do recurso. */
export const ESTADOS_QUE_OCUPAM: EstadoReserva[] = ['PROVISORIA', 'CONFIRMADA'];

/** Horário de cada turno no fuso de Lavras/MG. */
const HORARIOS: Record<Turno, [string, string]> = {
  MANHA: ['06:00', '12:00'],
  TARDE: ['12:00', '18:00'],
  NOITE: ['18:00', '24:00'],
};
const FUSO = '-03:00';

export interface Recurso {
  id: string;
  tipo: 'VEICULO' | 'EQUIPAMENTO';
  categoria: Categoria;
  identificacao: string;
  descricao: string | null;
  situacao: 'OPERACIONAL' | 'INATIVO';
  emManutencaoAgora: boolean;
  criadoEm: string;
}

export interface Manutencao {
  id: string;
  recursoId: string;
  inicio: string;
  fim: string;
  motivo: string;
}

export interface Reserva {
  id: string;
  recursoId: string;
  acaoId: string;
  sagaId: string;
  data: string;
  turno: Turno;
  estado: EstadoReserva;
}

export interface TurnoDisponivel {
  turno: Turno;
  disponivel: boolean;
  motivo: 'RESERVADO' | 'EM_MANUTENCAO' | null;
  reservaId: string | null;
}

export interface Disponibilidade {
  recursoId: string;
  categoria: Categoria;
  identificacao: string;
  data: string;
  turnos: TurnoDisponivel[];
}

export interface PedidoReserva {
  sagaId: string;
  acaoId: string;
  categoria: Categoria;
  data: string;
  turno: Turno;
}

export class RecursoNaoEncontrado extends Error {
  constructor(readonly recursoId: string) {
    super(`Recurso ${recursoId} não encontrado.`);
  }
}

export class ManutencaoInvalida extends Error {}

export function ehTurno(valor: unknown): valor is Turno {
  return typeof valor === 'string' && (TURNOS as readonly string[]).includes(valor);
}

export function ehCategoria(valor: unknown): valor is Categoria {
  return typeof valor === 'string' && (CATEGORIAS as readonly string[]).includes(valor);
}

export function ehData(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor));
}

/** Início e fim de um turno numa data, como instantes. */
export function janelaDoTurno(data: string, turno: Turno): { inicio: Date; fim: Date } {
  const [de, ate] = HORARIOS[turno];
  const inicio = new Date(`${data}T${de}:00${FUSO}`);
  const fim =
    ate === '24:00'
      ? new Date(inicio.getTime() + 6 * 60 * 60 * 1000)
      : new Date(`${data}T${ate}:00${FUSO}`);
  return { inicio, fim };
}

export function sobrepoe(m: Pick<Manutencao, 'inicio' | 'fim'>, janela: { inicio: Date; fim: Date }): boolean {
  return Date.parse(m.inicio) < janela.fim.getTime() && Date.parse(m.fim) > janela.inicio.getTime();
}

/**
 * Escolhe o recurso para o pedido: o primeiro operacional da categoria, por
 * identificação, que não esteja reservado nem em manutenção no turno.
 * Quando não há, devolve o motivo da recusa.
 */
export function escolherRecurso(
  recursos: Recurso[],
  ocupados: Set<string>,
  emManutencao: Set<string>,
  pedido: PedidoReserva,
): { recurso: Recurso } | { motivo: string } {
  const daCategoria = recursos
    .filter((r) => r.situacao === 'OPERACIONAL' && r.categoria === pedido.categoria)
    .sort((a, b) => a.identificacao.localeCompare(b.identificacao));
  const livre = daCategoria.find((r) => !ocupados.has(r.id) && !emManutencao.has(r.id));
  if (livre) return { recurso: livre };

  const base = `Nenhum recurso da categoria ${pedido.categoria} disponível em ${pedido.data}, turno ${pedido.turno}`;
  const detalhes = daCategoria.map(
    (r) => `${r.identificacao} ${emManutencao.has(r.id) ? 'em manutenção' : 'já reservado'}`,
  );
  return { motivo: detalhes.length > 0 ? `${base}: ${detalhes.join(', ')}.` : `${base}.` };
}

export function montarDisponibilidade(
  recursos: Recurso[],
  reservas: Reserva[],
  manutencoes: Manutencao[],
  data: string,
): Disponibilidade[] {
  return recursos.map((recurso) => ({
    recursoId: recurso.id,
    categoria: recurso.categoria,
    identificacao: recurso.identificacao,
    data,
    turnos: TURNOS.map((turno): TurnoDisponivel => {
      const reserva = reservas.find(
        (r) => r.recursoId === recurso.id && r.turno === turno && ESTADOS_QUE_OCUPAM.includes(r.estado),
      );
      if (reserva) return { turno, disponivel: false, motivo: 'RESERVADO', reservaId: reserva.id };
      const janela = janelaDoTurno(data, turno);
      const parado = manutencoes.some((m) => m.recursoId === recurso.id && sobrepoe(m, janela));
      if (parado) return { turno, disponivel: false, motivo: 'EM_MANUTENCAO', reservaId: null };
      return { turno, disponivel: true, motivo: null, reservaId: null };
    }),
  }));
}

export const REPOSITORIO_FROTA = Symbol('RepositorioFrota');

export interface RepositorioFrota {
  listar(categoria?: Categoria): Promise<Recurso[]>;
  obter(id: string): Promise<Recurso | null>;
  registrarManutencao(manutencao: Manutencao): Promise<void>;
  reservasNaData(data: string): Promise<Reserva[]>;
  manutencoesNoPeriodo(inicio: Date, fim: Date): Promise<Manutencao[]>;
}
