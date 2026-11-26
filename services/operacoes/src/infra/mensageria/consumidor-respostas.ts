import { Injectable } from '@nestjs/common';

import { Envelope } from '@domain/mensagem';
import { Orquestrador } from '@use-cases/orquestrador';

import { ConexaoRabbitMQ } from './conexao-rabbitmq';
import { Consumidor } from './consumidor';

/** Respostas de Equipes e Frota aos comandos da SAGA. */
@Injectable()
export class ConsumidorRespostas extends Consumidor {
  constructor(rabbit: ConexaoRabbitMQ, private readonly orquestrador: Orquestrador) {
    super(rabbit, 'operacoes.respostas');
  }

  protected tratar(envelope: Envelope): Promise<void> {
    return this.orquestrador.responder(envelope);
  }
}
