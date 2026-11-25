import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';

import { REPOSITORIO_ACOES, RepositorioAcoes } from '@domain/portas';
import { Orquestrador } from '@use-cases/orquestrador';

const INTERVALO_MS = 5000;

/** Procura SAGAs paradas além do prazo e manda compensar. */
@Injectable()
export class VigiaDePrazos implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(VigiaDePrazos.name);
  private timer?: NodeJS.Timeout;
  private ciclo?: Promise<void>;

  constructor(
    @Inject(REPOSITORIO_ACOES) private readonly acoes: RepositorioAcoes,
    private readonly orquestrador: Orquestrador,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      this.ciclo ??= this.verificar().finally(() => {
        this.ciclo = undefined;
      });
    }, INTERVALO_MS);
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.ciclo;
  }

  private async verificar(): Promise<void> {
    try {
      for (const sagaId of await this.acoes.sagasVencidas(new Date())) {
        await this.orquestrador.vencerPrazo(sagaId);
      }
    } catch (erro) {
      this.logger.warn(`Falha ao verificar prazos das SAGAs: ${(erro as Error).message}`);
    }
  }
}
