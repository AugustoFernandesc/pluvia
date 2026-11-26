import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from '@app/health/health.controller';
import { PanoramasController } from '@app/panoramas/panoramas.controller';
import { SinalizacoesController } from '@app/sinalizacoes/sinalizacoes.controller';
import { REPOSITORIO_PANORAMAS } from '@domain/panorama';
import { REPOSITORIO_SINALIZACOES } from '@domain/sinalizacao';
import { RepositorioSinalizacoesTypeorm } from '@infra/db/escrita/repositories/sinalizacao.repository';
import { RepositorioPanoramasTypeorm } from '@infra/db/leitura/repositories/panorama.repository';
import { ConexaoRabbitMQ } from '@infra/mensageria/conexao-rabbitmq';
import { ConsumidorProjetor } from '@infra/mensageria/consumidor-projetor';
import { PublicadorOutbox } from '@infra/mensageria/publicador-outbox';
import { ListarPanoramas, ObterPanorama } from '@use-cases/panoramas';
import { ProjetarEvento } from '@use-cases/projetar-evento';
import {
  ListarSinalizacoes,
  ObterSinalizacao,
  ReconhecerSinalizacao,
} from '@use-cases/sinalizacoes';

import { GlobalModule } from './global.module';

@Module({
  imports: [GlobalModule, TerminusModule],
  controllers: [HealthController, PanoramasController, SinalizacoesController],
  providers: [
    { provide: REPOSITORIO_SINALIZACOES, useClass: RepositorioSinalizacoesTypeorm },
    { provide: REPOSITORIO_PANORAMAS, useClass: RepositorioPanoramasTypeorm },
    ReconhecerSinalizacao,
    ListarSinalizacoes,
    ObterSinalizacao,
    ListarPanoramas,
    ObterPanorama,
    ProjetarEvento,
    ConexaoRabbitMQ,
    PublicadorOutbox,
    ConsumidorProjetor,
  ],
})
export class AppModule {}
