import { Injectable } from '@nestjs/common';

import { Envelope } from '@domain/mensagem';
import { ProcessarMensagem } from '@use-cases/processar-mensagem';

import { ConexaoRabbitMQ } from './conexao-rabbitmq';
import { Consumidor } from './consumidor';

/** Comandos da SAGA vindos de Operações: ReservarRecurso e LiberarRecurso. */
@Injectable()
export class ConsumidorComandos extends Consumidor {
  constructor(rabbit: ConexaoRabbitMQ, private readonly processar: ProcessarMensagem) {
    super(rabbit, 'frota.comandos');
  }

  protected tratar(envelope: Envelope): Promise<void> {
    return this.processar.executar(envelope);
  }
}

/** Eventos de ação (confirmada, cancelada) que mudam o estado das reservas. */
@Injectable()
export class ConsumidorEventos extends Consumidor {
  constructor(rabbit: ConexaoRabbitMQ, private readonly processar: ProcessarMensagem) {
    super(rabbit, 'frota.eventos');
  }

  protected tratar(envelope: Envelope): Promise<void> {
    return this.processar.executar(envelope);
  }
}
