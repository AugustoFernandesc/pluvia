import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelModel, connect } from 'amqplib';

/** Exchange de fatos ocorridos (08-eventos.md). */
export const EXCHANGE_EVENTOS = 'pluvia.eventos';

/**
 * Uma conexão AMQP compartilhada pelo publicador e pelo projetor. Abre na
 * primeira vez que alguém pede e, se cair, a próxima chamada abre de novo.
 * Exchanges e filas não são declaradas aqui: elas vêm prontas do
 * infra/rabbitmq/definitions.json.
 */
@Injectable()
export class ConexaoRabbitMQ implements OnApplicationShutdown {
  private readonly logger = new Logger(ConexaoRabbitMQ.name);
  private readonly url: string;
  private conexao?: ChannelModel;
  private abrindo?: Promise<ChannelModel>;
  private encerrando = false;

  constructor(config: ConfigService) {
    const usuario = encodeURIComponent(config.getOrThrow<string>('RABBITMQ_USER'));
    const senha = encodeURIComponent(config.getOrThrow<string>('RABBITMQ_PASSWORD'));
    const host = config.getOrThrow<string>('RABBITMQ_HOST');
    const porta = config.getOrThrow<number>('RABBITMQ_PORT');
    const vhost = encodeURIComponent(config.getOrThrow<string>('RABBITMQ_VHOST'));
    this.url = `amqp://${usuario}:${senha}@${host}:${porta}/${vhost}`;
  }

  async conectar(): Promise<ChannelModel> {
    if (this.encerrando) throw new Error('Aplicação encerrando.');
    if (this.conexao) return this.conexao;
    this.abrindo ??= connect(this.url)
      .then((conexao) => {
        conexao.on('error', (erro: Error) => this.logger.warn(`Erro na conexão: ${erro.message}`));
        conexao.on('close', () => {
          this.conexao = undefined;
          if (!this.encerrando) this.logger.warn('Conexão com o RabbitMQ fechada.');
        });
        this.conexao = conexao;
        this.logger.log('Conectado ao RabbitMQ.');
        return conexao;
      })
      .finally(() => {
        this.abrindo = undefined;
      });
    return this.abrindo;
  }

  async onApplicationShutdown(): Promise<void> {
    this.encerrando = true;
    await this.conexao?.close().catch(() => undefined);
  }
}
