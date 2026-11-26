import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfirmChannel } from 'amqplib';
import { DataSource } from 'typeorm';

import { Envelope } from '@domain/mensagem';

import { ConexaoRabbitMQ } from './conexao-rabbitmq';

export const INTERVALO_OUTBOX_MS = 1000;
const LOTE = 50;

interface Pendente {
  id: string;
  exchange: string;
  routing_key: string;
  payload: Envelope;
}

/**
 * Lê a outbox a cada 1 s e publica no RabbitMQ o que ainda não foi publicado.
 *
 * A mudança de estado e o INSERT na outbox acontecem na mesma transação. Sem
 * isso, se o serviço caísse entre gravar no banco e publicar, a mensagem se
 * perderia (dual write).
 *
 * A entrega é "pelo menos uma vez": só marca `publicado_em` depois que o
 * broker confirma. Uma repetição é descartada pelo consumidor, que guarda o
 * `id` de cada mensagem processada.
 */
@Injectable()
export class PublicadorOutbox implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PublicadorOutbox.name);
  private timer?: NodeJS.Timeout;
  private ciclo?: Promise<number>;
  private canal?: ConfirmChannel;
  private ultimoErro?: string;

  constructor(
    private readonly banco: DataSource,
    private readonly rabbit: ConexaoRabbitMQ,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.publicarPendentes(), INTERVALO_OUTBOX_MS);
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.ciclo?.catch(() => undefined);
    await this.canal?.close().catch(() => undefined);
  }

  /** Um ciclo do publicador. Devolve quantas mensagens publicou. */
  publicarPendentes(): Promise<number> {
    if (this.ciclo) return this.ciclo;
    this.ciclo = this.executarCiclo().finally(() => {
      this.ciclo = undefined;
    });
    return this.ciclo;
  }

  private async executarCiclo(): Promise<number> {
    try {
      const publicados = await this.banco.transaction(async (m) => {
        const pendentes: Pendente[] = await m.query(
          `SELECT id, exchange, routing_key, payload FROM outbox
            WHERE publicado_em IS NULL
            ORDER BY seq
            LIMIT ${LOTE}
            FOR UPDATE SKIP LOCKED`,
        );
        if (pendentes.length === 0) return 0;

        const canal = await this.obterCanal();
        for (const p of pendentes) {
          canal.publish(p.exchange, p.routing_key, Buffer.from(JSON.stringify(p.payload)), {
            persistent: true,
            contentType: 'application/json',
            messageId: p.id,
            type: p.payload.tipo,
            correlationId: p.payload.correlationId,
            timestamp: Math.floor(Date.now() / 1000),
          });
        }
        await canal.waitForConfirms();

        await m.query('UPDATE outbox SET publicado_em = now() WHERE id = ANY($1::uuid[])', [
          pendentes.map((p) => p.id),
        ]);
        return pendentes.length;
      });
      if (publicados > 0) this.logger.log(`${publicados} mensagem(ns) publicada(s) da outbox.`);
      this.ultimoErro = undefined;
      return publicados;
    } catch (erro) {
      this.canal = undefined;
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      if (mensagem !== this.ultimoErro) {
        this.logger.warn(`Outbox não publicada, nova tentativa em 1 s: ${mensagem}`);
        this.ultimoErro = mensagem;
      }
      return 0;
    }
  }

  private async obterCanal(): Promise<ConfirmChannel> {
    if (this.canal) return this.canal;
    const conexao = await this.rabbit.conectar();
    const canal = await conexao.createConfirmChannel();
    canal.on('error', () => undefined);
    canal.on('close', () => {
      if (this.canal === canal) this.canal = undefined;
    });
    this.canal = canal;
    return canal;
  }
}
