import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Channel, ConsumeMessage } from 'amqplib';

import { Envelope } from '@domain/evento';
import { EventoInvalido, ProjetarEvento } from '@use-cases/projetar-evento';

import { ConexaoRabbitMQ } from './conexao-rabbitmq';

/** Fila declarada em infra/rabbitmq/definitions.json, ligada a risco.sinalizacao.*. */
export const FILA_PROJETOR = 'risco.projetor';
const ESPERA_RECONEXAO_MS = 2000;
const ESPERA_NOVA_TENTATIVA_MS = 1000;

function lerEnvelope(msg: ConsumeMessage): Envelope {
  let envelope: Partial<Envelope>;
  try {
    envelope = JSON.parse(msg.content.toString('utf8'));
  } catch {
    throw new EventoInvalido('Mensagem não é JSON.');
  }
  if (typeof envelope?.id !== 'string' || typeof envelope.tipo !== 'string' || typeof envelope.ocorridoEm !== 'string') {
    throw new EventoInvalido('Mensagem sem id, tipo ou ocorridoEm.');
  }
  return envelope as Envelope;
}

/**
 * Consome a fila risco.projetor e atualiza o banco de leitura.
 *
 * O `ack` só acontece depois que a transação do banco de leitura foi
 * confirmada. Se o processo cair antes disso, o RabbitMQ entrega a mensagem de
 * novo, e a tabela mensagens_processadas impede que ela seja aplicada duas
 * vezes.
 */
@Injectable()
export class ConsumidorProjetor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ConsumidorProjetor.name);
  private canal?: Channel;
  private encerrando = false;
  private reconexao?: NodeJS.Timeout;
  private readonly emAndamento = new Set<Promise<void>>();

  constructor(
    private readonly rabbit: ConexaoRabbitMQ,
    private readonly projetar: ProjetarEvento,
  ) {}

  onApplicationBootstrap(): void {
    void this.iniciar();
  }

  async onModuleDestroy(): Promise<void> {
    this.encerrando = true;
    clearTimeout(this.reconexao);
    await Promise.allSettled(this.emAndamento);
    await this.canal?.close().catch(() => undefined);
  }

  private async iniciar(): Promise<void> {
    if (this.encerrando) return;
    try {
      const conexao = await this.rabbit.conectar();
      const canal = await conexao.createChannel();
      canal.on('error', () => undefined);
      canal.on('close', () => {
        this.canal = undefined;
        this.agendarReconexao();
      });
      await canal.prefetch(10);
      await canal.consume(FILA_PROJETOR, (msg) => {
        if (!msg) return; // consumo cancelado pelo broker; o 'close' reconecta
        const tarefa = this.receber(canal, msg);
        this.emAndamento.add(tarefa);
        void tarefa.finally(() => this.emAndamento.delete(tarefa));
      });
      this.canal = canal;
      this.logger.log(`Consumindo a fila ${FILA_PROJETOR}.`);
    } catch (erro) {
      this.logger.warn(
        `Projetor sem RabbitMQ, nova tentativa em ${ESPERA_RECONEXAO_MS / 1000} s: ${(erro as Error).message}`,
      );
      this.agendarReconexao();
    }
  }

  private agendarReconexao(): void {
    if (this.encerrando || this.reconexao) return;
    this.reconexao = setTimeout(() => {
      this.reconexao = undefined;
      void this.iniciar();
    }, ESPERA_RECONEXAO_MS);
  }

  private async receber(canal: Channel, msg: ConsumeMessage): Promise<void> {
    try {
      const envelope = lerEnvelope(msg);
      await this.projetar.executar(envelope);
      canal.ack(msg);
    } catch (erro) {
      if (erro instanceof EventoInvalido) {
        // Nunca vai dar certo: descarta sem devolver para a fila.
        this.logger.error(`Mensagem descartada: ${erro.message}`);
        this.tentar(() => canal.nack(msg, false, false));
        return;
      }
      // Falha passageira (banco de leitura fora, por exemplo): devolve para a
      // fila depois de uma pausa, para não girar sem parar.
      this.logger.warn(`Falha ao projetar, a mensagem volta para a fila: ${(erro as Error).message}`);
      await new Promise((r) => setTimeout(r, ESPERA_NOVA_TENTATIVA_MS));
      this.tentar(() => canal.nack(msg, false, true));
    }
  }

  /** Se o canal já fechou, o broker devolve a mensagem sozinho. */
  private tentar(acao: () => void): void {
    try {
      acao();
    } catch {
      /* canal fechado */
    }
  }
}
