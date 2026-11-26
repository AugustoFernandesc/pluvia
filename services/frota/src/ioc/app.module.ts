import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from '@app/health/health.controller';
import { RecursosController } from '@app/recursos/recursos.controller';
import { REPOSITORIO_FROTA } from '@domain/frota';
import {
  RepositorioFrotaTypeorm,
  UnidadeDeTrabalhoTypeorm,
} from '@infra/db/repositories/frota.repository';
import { ConexaoRabbitMQ } from '@infra/mensageria/conexao-rabbitmq';
import { ConsumidorComandos, ConsumidorEventos } from '@infra/mensageria/consumidores';
import { PublicadorOutbox } from '@infra/mensageria/publicador-outbox';
import { ConsultarDisponibilidade, ListarRecursos, RegistrarManutencao } from '@use-cases/consultas';
import { ProcessarMensagem, UNIDADE_DE_TRABALHO } from '@use-cases/processar-mensagem';

import { GlobalModule } from './global.module';

@Module({
  imports: [GlobalModule, TerminusModule],
  controllers: [HealthController, RecursosController],
  providers: [
    { provide: REPOSITORIO_FROTA, useClass: RepositorioFrotaTypeorm },
    { provide: UNIDADE_DE_TRABALHO, useClass: UnidadeDeTrabalhoTypeorm },
    ListarRecursos,
    RegistrarManutencao,
    ConsultarDisponibilidade,
    ProcessarMensagem,
    ConexaoRabbitMQ,
    PublicadorOutbox,
    ConsumidorComandos,
    ConsumidorEventos,
  ],
})
export class AppModule {}
