import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfirmChannel } from 'amqplib';
import { DataSource } from 'typeorm';

import { Envelope } from '@domain/evento';
import { BANCO_ESCRITA } from '@infra/db/conn/data-source';

import { ConexaoRabbitMQ, EXCHANGE_EVENTOS } from './conexao-rabbitmq';

export const INTERVALO_OUTBOX_MS = 1000;
const LOTE = 50;

interface Pendente {
  id: string;
  routing_key: string;
  payload: Envelope;
}

/**
 * Lê a outbox a cada 1 s e publica no RabbitMQ o que ainda não foi publicado.
 *
 * A entrega é "pelo menos uma vez": só marca `publicado_em` depois que o
 * broker confirma. Se o serviço cair entre a confirmação e o UPDATE, o evento
 * sai de novo no próximo ciclo, e o projetor descarta a repetição pelo `id`.
 *
 * O `FOR UPDATE SKIP LOCKED` deixa rodar mais de uma réplica do Risco sem que
 * as duas publiquem o mesmo registro ao mesmo tempo.
 */
@Injectable()
export class PublicadorOutbox implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PublicadorOutbox.name);
  private timer?: NodeJS.Timeout;
  private ciclo?: Promise<number>;
  private canal?: ConfirmChannel;
  private ultimoErro?: string;

  constructor(
    @InjectDataSource(BANCO_ESCRITA) private readonly escrita: DataSource,
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

  /** Um ciclo do publicador. Devolve quantos eventos publicou. */
  publicarPendentes(): Promise<number> {
    // Se o ciclo anterior ainda não terminou, não começa outro por cima.
    if (this.ciclo) return this.ciclo;
    this.ciclo = this.executarCiclo().finally(() => {
      this.ciclo = undefined;
    });
    return this.ciclo;
  }

  private async executarCiclo(): Promise<number> {
    try {
      const publicados = await this.escrita.transaction(async (m) => {
        const pendentes: Pendente[] = await m.query(
          `SELECT id, routing_key, payload FROM outbox
            WHERE publicado_em IS NULL
            ORDER BY criado_em
            LIMIT ${LOTE}
            FOR UPDATE SKIP LOCKED`,
        );
        if (pendentes.length === 0) return 0;

        const canal = await this.obterCanal();
        for (const p of pendentes) {
          canal.publish(EXCHANGE_EVENTOS, p.routing_key, Buffer.from(JSON.stringify(p.payload)), {
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
      if (publicados > 0) this.logger.log(`${publicados} evento(s) publicado(s) da outbox.`);
      this.ultimoErro = undefined;
      return publicados;
    } catch (erro) {
      this.canal = undefined;
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      // Só loga quando o erro muda, para não encher o log a cada segundo.
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
