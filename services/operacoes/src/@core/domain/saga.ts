import { Acao } from './acao';

/**
 * Máquina de estados da SAGA de abertura de ação preventiva
 * (docs/arquitetura/06-saga.md). Ordem fixa: reservar a equipe e depois o
 * recurso. T4, a confirmação da ação, é o pivô: depois dela não há
 * compensação.
 */
export type EstadoSaga = 'AGUARDANDO_EQUIPE' | 'AGUARDANDO_RECURSO' | 'CONCLUIDA' | 'COMPENSANDO' | 'COMPENSADA';

export type Participante = 'EQUIPES' | 'FROTA';

export interface Saga {
  id: string;
  acaoId: string;
  estado: EstadoSaga;
  equipeId: string | null;
  recursoId: string | null;
  motivo: string | null;
  aguardaLiberarEquipe: boolean;
  aguardaLiberarRecurso: boolean;
  /** Até quando a SAGA espera a resposta do passo atual antes de compensar. */
  prazo: string | null;
  iniciadaEm: string;
  encerradaEm: string | null;
}

export interface PassoSaga {
  mensagem: string;
  direcao: 'ENVIADA' | 'RECEBIDA';
  participante: Participante | null;
  detalhe: string | null;
  registradoEm: string;
}

export type Comando = 'ReservarEquipe' | 'ReservarRecurso' | 'LiberarEquipe' | 'LiberarRecurso';

export const ROTA_DO_PARTICIPANTE: Record<Participante, string> = {
  EQUIPES: 'equipes.comandos',
  FROTA: 'frota.comandos',
};

export const PARTICIPANTE_DO_COMANDO: Record<Comando, Participante> = {
  ReservarEquipe: 'EQUIPES',
  LiberarEquipe: 'EQUIPES',
  ReservarRecurso: 'FROTA',
  LiberarRecurso: 'FROTA',
};

export type Resposta =
  | { tipo: 'EquipeReservada'; equipeId: string }
  | { tipo: 'ReservaEquipeRecusada'; motivo: string }
  | { tipo: 'RecursoReservado'; recursoId: string }
  | { tipo: 'ReservaRecursoRecusada'; motivo: string }
  | { tipo: 'EquipeLiberada' }
  | { tipo: 'RecursoLiberado' };

export const PARTICIPANTE_DA_RESPOSTA: Record<Resposta['tipo'], Participante> = {
  EquipeReservada: 'EQUIPES',
  ReservaEquipeRecusada: 'EQUIPES',
  EquipeLiberada: 'EQUIPES',
  RecursoReservado: 'FROTA',
  ReservaRecursoRecusada: 'FROTA',
  RecursoLiberado: 'FROTA',
};

/** O que o orquestrador faz depois de uma transição. */
export type Desfecho =
  | { tipo: 'enviar'; comandos: Comando[] }
  | { tipo: 'confirmar' }
  | { tipo: 'rejeitar'; motivo: string }
  | { tipo: 'aguardar' };

/** A resposta não combina com o estado atual da SAGA e é descartada. */
export class RespostaFora extends Error {}

const ESTADO_QUE_ACEITA: Record<Resposta['tipo'], EstadoSaga> = {
  EquipeReservada: 'AGUARDANDO_EQUIPE',
  ReservaEquipeRecusada: 'AGUARDANDO_EQUIPE',
  RecursoReservado: 'AGUARDANDO_RECURSO',
  ReservaRecursoRecusada: 'AGUARDANDO_RECURSO',
  EquipeLiberada: 'COMPENSANDO',
  RecursoLiberado: 'COMPENSANDO',
};

export function iniciarSaga(id: string, acao: Acao, prazo: Date): Saga {
  return {
    id,
    acaoId: acao.id,
    estado: 'AGUARDANDO_EQUIPE',
    equipeId: null,
    recursoId: null,
    motivo: null,
    aguardaLiberarEquipe: false,
    aguardaLiberarRecurso: false,
    prazo: prazo.toISOString(),
    iniciadaEm: new Date().toISOString(),
    encerradaEm: null,
  };
}

function compensando(saga: Saga, motivo: string, liberarRecurso: boolean): Desfecho {
  saga.estado = 'COMPENSANDO';
  saga.motivo = motivo;
  saga.aguardaLiberarEquipe = true;
  saga.aguardaLiberarRecurso = liberarRecurso;
  saga.prazo = null;
  const comandos: Comando[] = ['LiberarEquipe'];
  if (liberarRecurso) comandos.push('LiberarRecurso');
  return { tipo: 'enviar', comandos };
}

function encerrar(saga: Saga, estado: 'CONCLUIDA' | 'COMPENSADA'): void {
  saga.estado = estado;
  saga.prazo = null;
  saga.encerradaEm = new Date().toISOString();
}

/** Aplica uma resposta de participante. Muda `saga` no lugar. */
export function aplicarResposta(saga: Saga, resposta: Resposta, novoPrazo: Date): Desfecho {
  if (ESTADO_QUE_ACEITA[resposta.tipo] !== saga.estado) {
    throw new RespostaFora(`${resposta.tipo} ignorada: a SAGA está em ${saga.estado}.`);
  }
  switch (resposta.tipo) {
    case 'EquipeReservada':
      saga.equipeId = resposta.equipeId;
      saga.estado = 'AGUARDANDO_RECURSO';
      saga.prazo = novoPrazo.toISOString();
      return { tipo: 'enviar', comandos: ['ReservarRecurso'] };
    case 'ReservaEquipeRecusada':
      // Nada foi reservado ainda: não há o que compensar.
      saga.motivo = resposta.motivo;
      encerrar(saga, 'COMPENSADA');
      return { tipo: 'rejeitar', motivo: resposta.motivo };
    case 'RecursoReservado':
      saga.recursoId = resposta.recursoId;
      encerrar(saga, 'CONCLUIDA');
      return { tipo: 'confirmar' };
    case 'ReservaRecursoRecusada':
      return compensando(saga, resposta.motivo, false);
    case 'EquipeLiberada':
    case 'RecursoLiberado':
      if (resposta.tipo === 'EquipeLiberada') saga.aguardaLiberarEquipe = false;
      else saga.aguardaLiberarRecurso = false;
      if (saga.aguardaLiberarEquipe || saga.aguardaLiberarRecurso) return { tipo: 'aguardar' };
      encerrar(saga, 'COMPENSADA');
      return { tipo: 'rejeitar', motivo: saga.motivo ?? 'SAGA compensada.' };
  }
}

/**
 * O participante não respondeu dentro do prazo. Compensa tudo o que pode ter
 * sido reservado: se a reserva atrasada chegar depois, a liberação, que vem
 * atrás dela na mesma fila, a desfaz.
 */
export function vencerPrazo(saga: Saga): Desfecho {
  if (saga.estado === 'AGUARDANDO_EQUIPE') {
    return compensando(saga, 'Equipes não respondeu dentro do prazo.', false);
  }
  if (saga.estado === 'AGUARDANDO_RECURSO') {
    return compensando(saga, 'Frota não respondeu dentro do prazo.', true);
  }
  throw new RespostaFora(`Prazo vencido ignorado: a SAGA está em ${saga.estado}.`);
}
