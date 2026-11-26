import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';

import { AcoesController } from '@app/acoes/acoes.controller';
import { HealthController } from '@app/health/health.controller';
import { PRAZO_SAGA_MS, REPOSITORIO_ACOES, UNIDADE_DE_TRABALHO } from '@domain/portas';
import {
  RepositorioAcoesTypeorm,
  UnidadeDeTrabalhoTypeorm,
} from '@infra/db/repositories/acoes.repository';
import { ConexaoRabbitMQ } from '@infra/mensageria/conexao-rabbitmq';
import { ConsumidorRespostas } from '@infra/mensageria/consumidor-respostas';
import { PublicadorOutbox } from '@infra/mensageria/publicador-outbox';
import { VigiaDePrazos } from '@infra/mensageria/vigia-de-prazos';
import { ListarAcoes, ObterAcao, ObterSaga } from '@use-cases/consultas';
import { Orquestrador } from '@use-cases/orquestrador';

import { GlobalModule } from './global.module';

const PRAZO_PADRAO_S = 30;

@Module({
  imports: [GlobalModule, TerminusModule],
  controllers: [HealthController, AcoesController],
  providers: [
    { provide: REPOSITORIO_ACOES, useClass: RepositorioAcoesTypeorm },
    { provide: UNIDADE_DE_TRABALHO, useClass: UnidadeDeTrabalhoTypeorm },
    {
      provide: PRAZO_SAGA_MS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        Number(config.get<string>('SAGA_PRAZO_S') ?? PRAZO_PADRAO_S) * 1000,
    },
    Orquestrador,
    ListarAcoes,
    ObterAcao,
    ObterSaga,
    ConexaoRabbitMQ,
    PublicadorOutbox,
    ConsumidorRespostas,
    VigiaDePrazos,
  ],
})
export class AppModule {}
