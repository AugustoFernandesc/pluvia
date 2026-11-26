import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

import {
  ESTADOS_QUE_OCUPAM,
  EstadoReserva,
  PedidoReserva,
  Recurso,
  Reserva,
  Turno,
  ehCategoria,
  ehData,
  ehTurno,
  escolherRecurso,
} from '@domain/frota';
import { Envelope, MensagemInvalida, criarEnvelope, texto } from '@domain/mensagem';

/** O que a transação de uma mensagem pode fazer no banco da Frota. */
export interface TransacaoFrota {
  reservaDaSaga(sagaId: string): Promise<Reserva | null>;
  recursos(): Promise<Recurso[]>;
  recursosOcupados(data: string, turno: Turno): Promise<Set<string>>;
  recursosEmManutencao(data: string, turno: Turno): Promise<Set<string>>;
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
  processar(mensagem: Envelope, trabalho: (tx: TransacaoFrota) => Promise<void>): Promise<boolean>;
}

const ORIGEM = 'frota';

function lerPedido(dados: Record<string, unknown>): PedidoReserva {
  const { categoria, data, turno } = dados;
  if (!ehCategoria(categoria)) throw new MensagemInvalida('categoria inválida.');
  if (!ehData(data)) throw new MensagemInvalida('data inválida.');
  if (!ehTurno(turno)) throw new MensagemInvalida('turno inválido.');
  return { sagaId: texto(dados, 'sagaId'), acaoId: texto(dados, 'acaoId'), categoria, data, turno };
}

/**
 * Participante da SAGA de abertura de ação (docs/arquitetura/06-saga.md):
 * reserva e libera recursos a pedido de Operações e confirma a reserva quando
 * a ação é confirmada. Recurso em manutenção no turno não pode ser reservado.
 */
@Injectable()
export class ProcessarMensagem {
  private readonly logger = new Logger(ProcessarMensagem.name);

  constructor(@Inject(UNIDADE_DE_TRABALHO) private readonly unidade: UnidadeDeTrabalho) {}

  async executar(mensagem: Envelope): Promise<void> {
    const processada = await this.unidade.processar(mensagem, (tx) => this.aplicar(tx, mensagem));
    if (!processada) this.logger.log(`Mensagem ${mensagem.id} (${mensagem.tipo}) repetida, ignorada.`);
  }

  private aplicar(tx: TransacaoFrota, mensagem: Envelope): Promise<void> {
    switch (mensagem.tipo) {
      case 'ReservarRecurso':
        return this.reservar(tx, mensagem);
      case 'LiberarRecurso':
        return this.liberar(tx, mensagem);
      case 'AcaoPreventivaConfirmada':
        return this.mudar(tx, mensagem, ['PROVISORIA'], 'CONFIRMADA');
      case 'AcaoPreventivaCancelada':
        return this.mudar(tx, mensagem, ESTADOS_QUE_OCUPAM, 'CANCELADA');
      default:
        return Promise.resolve();
    }
  }

  private async reservar(tx: TransacaoFrota, mensagem: Envelope): Promise<void> {
    const pedido = lerPedido(mensagem.dados);
    const responder = (tipo: string, dados: object) =>
      tx.responder(criarEnvelope(ORIGEM, tipo, dados, mensagem.correlationId, mensagem.id));

    // Idempotência por sagaId: a mesma SAGA nunca ganha duas reservas.
    const existente = await tx.reservaDaSaga(pedido.sagaId);
    if (existente) {
      if (ESTADOS_QUE_OCUPAM.includes(existente.estado)) {
        return responder('RecursoReservado', {
          sagaId: pedido.sagaId,
          reservaId: existente.id,
          recursoId: existente.recursoId,
        });
      }
      return responder('ReservaRecursoRecusada', {
        sagaId: pedido.sagaId,
        motivo: 'A reserva desta SAGA já foi liberada.',
      });
    }

    const escolha = escolherRecurso(
      await tx.recursos(),
      await tx.recursosOcupados(pedido.data, pedido.turno),
      await tx.recursosEmManutencao(pedido.data, pedido.turno),
      pedido,
    );
    if ('motivo' in escolha) {
      this.logger.log(`SAGA ${pedido.sagaId}: ${escolha.motivo}`);
      return responder('ReservaRecursoRecusada', { sagaId: pedido.sagaId, motivo: escolha.motivo });
    }

    const reserva: Reserva = {
      id: randomUUID(),
      recursoId: escolha.recurso.id,
      acaoId: pedido.acaoId,
      sagaId: pedido.sagaId,
      data: pedido.data,
      turno: pedido.turno,
      estado: 'PROVISORIA',
    };
    await tx.criarReserva(reserva);
    this.logger.log(
      `SAGA ${pedido.sagaId}: ${escolha.recurso.identificacao} reservado para ${pedido.data}, ${pedido.turno}.`,
    );
    return responder('RecursoReservado', {
      sagaId: pedido.sagaId,
      reservaId: reserva.id,
      recursoId: escolha.recurso.id,
    });
  }

  /** Liberar o que não existe, ou o que já foi liberado, também é sucesso. */
  private async liberar(tx: TransacaoFrota, mensagem: Envelope): Promise<void> {
    const sagaId = texto(mensagem.dados, 'sagaId');
    const liberadas = await tx.mudarEstado(sagaId, ESTADOS_QUE_OCUPAM, 'CANCELADA');
    this.logger.log(`SAGA ${sagaId}: ${liberadas} reserva(s) liberada(s).`);
    await tx.responder(criarEnvelope(ORIGEM, 'RecursoLiberado', { sagaId }, mensagem.correlationId, mensagem.id));
  }

  private async mudar(
    tx: TransacaoFrota,
    mensagem: Envelope,
    de: EstadoReserva[],
    para: EstadoReserva,
  ): Promise<void> {
    const sagaId = texto(mensagem.dados, 'sagaId');
    const alteradas = await tx.mudarEstado(sagaId, de, para);
    if (alteradas > 0) this.logger.log(`SAGA ${sagaId}: reserva passou a ${para}.`);
  }
}
