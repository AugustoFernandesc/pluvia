export const TURNOS = ['MANHA', 'TARDE', 'NOITE'] as const;
export type Turno = (typeof TURNOS)[number];

export const ESPECIALIDADES = ['DRENAGEM', 'VISTORIA', 'DESOBSTRUCAO', 'GERAL'] as const;
export type Especialidade = (typeof ESPECIALIDADES)[number];

/**
 * PROVISORIA enquanto a SAGA não termina, CONFIRMADA depois de
 * AcaoPreventivaConfirmada, CANCELADA por compensação ou cancelamento da ação.
 */
export type EstadoReserva = 'PROVISORIA' | 'CONFIRMADA' | 'CANCELADA';

/** Estados em que a reserva ocupa o turno da equipe. */
export const ESTADOS_QUE_OCUPAM: EstadoReserva[] = ['PROVISORIA', 'CONFIRMADA'];

export interface Equipe {
  id: string;
  nome: string;
  especialidade: Especialidade;
  integrantes: number;
  ativa: boolean;
  criadaEm: string;
}

export interface Reserva {
  id: string;
  equipeId: string;
  acaoId: string;
  sagaId: string;
  data: string;
  turno: Turno;
  estado: EstadoReserva;
}

export interface TurnoDisponivel {
  turno: Turno;
  disponivel: boolean;
  motivo: 'RESERVADA' | null;
  reservaId: string | null;
}

export interface Disponibilidade {
  equipeId: string;
  equipeNome: string;
  data: string;
  turnos: TurnoDisponivel[];
}

export interface PedidoReserva {
  sagaId: string;
  acaoId: string;
  especialidade: Especialidade;
  equipeId?: string;
  data: string;
  turno: Turno;
}

export function ehTurno(valor: unknown): valor is Turno {
  return typeof valor === 'string' && (TURNOS as readonly string[]).includes(valor);
}

export function ehEspecialidade(valor: unknown): valor is Especialidade {
  return typeof valor === 'string' && (ESPECIALIDADES as readonly string[]).includes(valor);
}

export function ehData(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor));
}

/**
 * Escolhe a equipe para o pedido: a pedida, se veio `equipeId`, ou a primeira
 * por nome entre as da especialidade. Só serve equipe ativa e livre no turno.
 */
export function escolherEquipe(
  equipes: Equipe[],
  ocupadas: Set<string>,
  pedido: PedidoReserva,
): Equipe | undefined {
  return equipes
    .filter((e) => e.ativa && e.especialidade === pedido.especialidade)
    .filter((e) => !pedido.equipeId || e.id === pedido.equipeId)
    .filter((e) => !ocupadas.has(e.id))
    .sort((a, b) => a.nome.localeCompare(b.nome))[0];
}

export function motivoSemEquipe(pedido: PedidoReserva): string {
  const qual = pedido.equipeId ? `A equipe ${pedido.equipeId}` : `Nenhuma equipe da especialidade ${pedido.especialidade}`;
  const verbo = pedido.equipeId ? 'não está disponível' : 'disponível';
  return `${qual} ${verbo} em ${pedido.data}, turno ${pedido.turno}.`;
}

export function montarDisponibilidade(equipes: Equipe[], reservas: Reserva[], data: string): Disponibilidade[] {
  return equipes.map((equipe) => ({
    equipeId: equipe.id,
    equipeNome: equipe.nome,
    data,
    turnos: TURNOS.map((turno) => {
      const reserva = reservas.find(
        (r) => r.equipeId === equipe.id && r.turno === turno && ESTADOS_QUE_OCUPAM.includes(r.estado),
      );
      return {
        turno,
        disponivel: !reserva,
        motivo: reserva ? 'RESERVADA' : null,
        reservaId: reserva?.id ?? null,
      };
    }),
  }));
}

export const REPOSITORIO_EQUIPES = Symbol('RepositorioEquipes');

export interface RepositorioEquipes {
  listar(especialidade?: Especialidade): Promise<Equipe[]>;
  reservasNaData(data: string): Promise<Reserva[]>;
}
