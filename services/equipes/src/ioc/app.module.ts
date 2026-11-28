import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { EquipesController } from '@app/equipes/equipes.controller';
import { HealthController } from '@app/health/health.controller';
import { REPOSITORIO_EQUIPES } from '@domain/equipe';
import {
  RepositorioEquipesTypeorm,
  UnidadeDeTrabalhoTypeorm,
} from '@infra/db/repositories/equipes.repository';
import { ConexaoRabbitMQ } from '@infra/mensageria/conexao-rabbitmq';
import { ConsumidorComandos, ConsumidorEventos } from '@infra/mensageria/consumidores';
import { PublicadorOutbox } from '@infra/mensageria/publicador-outbox';
import { ConsultarDisponibilidade, ListarEquipes } from '@use-cases/consultas';
import { ProcessarMensagem, UNIDADE_DE_TRABALHO } from '@use-cases/processar-mensagem';

import { GlobalModule } from './global.module';

@Module({
  imports: [GlobalModule, TerminusModule],
  controllers: [HealthController, EquipesController],
  providers: [
    { provide: REPOSITORIO_EQUIPES, useClass: RepositorioEquipesTypeorm },
    { provide: UNIDADE_DE_TRABALHO, useClass: UnidadeDeTrabalhoTypeorm },
    ListarEquipes,
    ConsultarDisponibilidade,
    ProcessarMensagem,
    ConexaoRabbitMQ,
    PublicadorOutbox,
    ConsumidorComandos,
    ConsumidorEventos,
  ],
})
export class AppModule {}
