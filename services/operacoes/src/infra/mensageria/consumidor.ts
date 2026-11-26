import { Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Channel, ConsumeMessage } from 'amqplib';

import { Envelope, MensagemInvalida } from '@domain/mensagem';

import { ConexaoRabbitMQ } from './conexao-rabbitmq';

const ESPERA_RECONEXAO_MS = 2000;
const ESPERA_NOVA_TENTATIVA_MS = 1000;

function lerEnvelope(msg: ConsumeMessage): Envelope {
  let envelope: Partial<Envelope>;
  try {
    envelope = JSON.parse(msg.content.toString('utf8'));
  } catch {
    throw new MensagemInvalida('Mensagem não é JSON.');
  }
  if (
    typeof envelope?.id !== 'string' ||
    typeof envelope.tipo !== 'string' ||
    typeof envelope.correlationId !== 'string' ||
    typeof envelope.dados !== 'object' ||
    envelope.dados === null
  ) {
    throw new MensagemInvalida('Mensagem sem id, tipo, correlationId ou dados.');
  }
  return envelope as Envelope;
}

/**
 * Consome uma fila declarada em infra/rabbitmq/definitions.json.
 *
 * O prefetch é 1: as mensagens de uma fila são tratadas uma por vez, na ordem
 * em que chegaram, que é o que a SAGA espera dos participantes.
 *
 * O `ack` só acontece depois que a transação foi confirmada. Se o processo
 * cair antes, o RabbitMQ entrega de novo, e a tabela mensagens_processadas
 * impede que a mensagem seja aplicada duas vezes.
 */
export abstract class Consumidor implements OnApplicationBootstrap, OnModuleDestroy {
  protected readonly logger = new Logger(this.constructor.name);
  private canal?: Channel;
  private encerrando = false;
  private reconexao?: NodeJS.Timeout;
  private emAndamento?: Promise<void>;

  protected constructor(
    private readonly rabbit: ConexaoRabbitMQ,
    private readonly fila: string,
  ) {}

  protected abstract tratar(envelope: Envelope): Promise<void>;

  onApplicationBootstrap(): void {
    void this.iniciar();
  }

  async onModuleDestroy(): Promise<void> {
    this.encerrando = true;
    clearTimeout(this.reconexao);
    await this.emAndamento?.catch(() => undefined);
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
      await canal.prefetch(1);
      await canal.consume(this.fila, (msg) => {
        if (!msg) return;
        this.emAndamento = this.receber(canal, msg);
      });
      this.canal = canal;
      this.logger.log(`Consumindo a fila ${this.fila}.`);
    } catch (erro) {
      this.logger.warn(
        `Sem RabbitMQ para a fila ${this.fila}, nova tentativa em ${ESPERA_RECONEXAO_MS / 1000} s: ${(erro as Error).message}`,
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
      await this.tratar(envelope);
      canal.ack(msg);
    } catch (erro) {
      if (erro instanceof MensagemInvalida) {
        this.logger.error(`Mensagem descartada: ${erro.message}`);
        this.tentar(() => canal.nack(msg, false, false));
        return;
      }
      this.logger.warn(`Falha ao processar, a mensagem volta para a fila: ${(erro as Error).message}`);
      await new Promise((r) => setTimeout(r, ESPERA_NOVA_TENTATIVA_MS));
      this.tentar(() => canal.nack(msg, false, true));
    }
  }

  private tentar(acao: () => void): void {
    try {
      acao();
    } catch {
      /* canal fechado: o broker devolve a mensagem sozinho */
    }
  }
}
