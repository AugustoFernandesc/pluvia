import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

import {
  ESTADOS_QUE_OCUPAM,
  Equipe,
  EstadoReserva,
  PedidoReserva,
  Reserva,
  Turno,
  ehData,
  ehEspecialidade,
  ehTurno,
  escolherEquipe,
  motivoSemEquipe,
} from '@domain/equipe';
import { Envelope, MensagemInvalida, criarEnvelope, texto } from '@domain/mensagem';

/** O que a transação de uma mensagem pode fazer no banco de Equipes. */
export interface TransacaoEquipes {
  reservaDaSaga(sagaId: string): Promise<Reserva | null>;
  equipes(): Promise<Equipe[]>;
  equipesOcupadas(data: string, turno: Turno): Promise<Set<string>>;
  criarReserva(reserva: Reserva): Promise<void>;
  mudarEstado(sagaId: string, de: EstadoReserva[], para: EstadoReserva): Promise<number>;
  /** Grava a resposta ao orquestrador na outbox, na mesma transação. */
  responder(resposta: Envelope): Promise<void>;
}

export const UNIDADE_DE_TRABALHO = Symbol('UnidadeDeTrabalho');

export interface UnidadeDeTrabalho {
  /**
   * Roda `trabalho` numa transação e registra a mensagem como processada.
   * Devolve false, sem rodar nada, se a mensagem já tinha sido processada.
   */
  processar(mensagem: Envelope, trabalho: (tx: TransacaoEquipes) => Promise<void>): Promise<boolean>;
}

const ORIGEM = 'equipes';

function lerPedido(dados: Record<string, unknown>): PedidoReserva {
  const { especialidade, data, turno, equipeId } = dados;
  if (!ehEspecialidade(especialidade)) throw new MensagemInvalida('especialidade inválida.');
  if (!ehData(data)) throw new MensagemInvalida('data inválida.');
  if (!ehTurno(turno)) throw new MensagemInvalida('turno inválido.');
  if (equipeId !== undefined && equipeId !== null && typeof equipeId !== 'string') {
    throw new MensagemInvalida('equipeId inválido.');
  }
  return {
    sagaId: texto(dados, 'sagaId'),
    acaoId: texto(dados, 'acaoId'),
    especialidade,
    equipeId: equipeId ?? undefined,
    data,
    turno,
  };
}

/**
 * Participante da SAGA de abertura de ação (docs/arquitetura/06-saga.md):
 * reserva e libera equipes a pedido de Operações e confirma a reserva quando
 * a ação é confirmada.
 */
@Injectable()
export class ProcessarMensagem {
  private readonly logger = new Logger(ProcessarMensagem.name);

  constructor(@Inject(UNIDADE_DE_TRABALHO) private readonly unidade: UnidadeDeTrabalho) {}

  async executar(mensagem: Envelope): Promise<void> {
    const processada = await this.unidade.processar(mensagem, (tx) => this.aplicar(tx, mensagem));
    if (!processada) this.logger.log(`Mensagem ${mensagem.id} (${mensagem.tipo}) repetida, ignorada.`);
  }

  private aplicar(tx: TransacaoEquipes, mensagem: Envelope): Promise<void> {
    switch (mensagem.tipo) {
      case 'ReservarEquipe':
        return this.reservar(tx, mensagem);
      case 'LiberarEquipe':
        return this.liberar(tx, mensagem);
      case 'AcaoPreventivaConfirmada':
        return this.mudar(tx, mensagem, ['PROVISORIA'], 'CONFIRMADA');
      case 'AcaoPreventivaCancelada':
        return this.mudar(tx, mensagem, ESTADOS_QUE_OCUPAM, 'CANCELADA');
      default:
        return Promise.resolve();
    }
  }

  private async reservar(tx: TransacaoEquipes, mensagem: Envelope): Promise<void> {
    const pedido = lerPedido(mensagem.dados);
    const responder = (tipo: string, dados: object) =>
      tx.responder(criarEnvelope(ORIGEM, tipo, dados, mensagem.correlationId, mensagem.id));

    // Idempotência por sagaId: a mesma SAGA nunca ganha duas reservas.
    const existente = await tx.reservaDaSaga(pedido.sagaId);
    if (existente) {
      if (ESTADOS_QUE_OCUPAM.includes(existente.estado)) {
        return responder('EquipeReservada', {
          sagaId: pedido.sagaId,
          reservaId: existente.id,
          equipeId: existente.equipeId,
        });
      }
      return responder('ReservaEquipeRecusada', {
        sagaId: pedido.sagaId,
        motivo: 'A reserva desta SAGA já foi liberada.',
      });
    }

    const equipe = escolherEquipe(
      await tx.equipes(),
      await tx.equipesOcupadas(pedido.data, pedido.turno),
      pedido,
    );
    if (!equipe) {
      this.logger.log(`SAGA ${pedido.sagaId}: ${motivoSemEquipe(pedido)}`);
      return responder('ReservaEquipeRecusada', { sagaId: pedido.sagaId, motivo: motivoSemEquipe(pedido) });
    }

    const reserva: Reserva = {
      id: randomUUID(),
      equipeId: equipe.id,
      acaoId: pedido.acaoId,
      sagaId: pedido.sagaId,
      data: pedido.data,
      turno: pedido.turno,
      estado: 'PROVISORIA',
    };
    await tx.criarReserva(reserva);
    this.logger.log(`SAGA ${pedido.sagaId}: ${equipe.nome} reservada para ${pedido.data}, ${pedido.turno}.`);
    return responder('EquipeReservada', { sagaId: pedido.sagaId, reservaId: reserva.id, equipeId: equipe.id });
  }

  /** Liberar o que não existe, ou o que já foi liberado, também é sucesso. */
  private async liberar(tx: TransacaoEquipes, mensagem: Envelope): Promise<void> {
    const sagaId = texto(mensagem.dados, 'sagaId');
    const liberadas = await tx.mudarEstado(sagaId, ESTADOS_QUE_OCUPAM, 'CANCELADA');
    this.logger.log(`SAGA ${sagaId}: ${liberadas} reserva(s) liberada(s).`);
    await tx.responder(criarEnvelope(ORIGEM, 'EquipeLiberada', { sagaId }, mensagem.correlationId, mensagem.id));
  }

  private async mudar(
    tx: TransacaoEquipes,
    mensagem: Envelope,
    de: EstadoReserva[],
    para: EstadoReserva,
  ): Promise<void> {
    const sagaId = texto(mensagem.dados, 'sagaId');
    const alteradas = await tx.mudarEstado(sagaId, de, para);
    if (alteradas > 0) this.logger.log(`SAGA ${sagaId}: reserva passou a ${para}.`);
  }
}
