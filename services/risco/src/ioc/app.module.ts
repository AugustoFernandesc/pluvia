import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from '@app/health/health.controller';
import { SinalizacoesController } from '@app/sinalizacoes/sinalizacoes.controller';
import { REPOSITORIO_SINALIZACOES } from '@domain/sinalizacao';
import { RepositorioSinalizacoesTypeorm } from '@infra/db/escrita/repositories/sinalizacao.repository';
import { ReconhecerSinalizacao } from '@use-cases/sinalizacoes';

import { GlobalModule } from './global.module';

@Module({
  imports: [GlobalModule, TerminusModule],
  controllers: [HealthController, SinalizacoesController],
  providers: [
    { provide: REPOSITORIO_SINALIZACOES, useClass: RepositorioSinalizacoesTypeorm },
    ReconhecerSinalizacao,
  ],
})
export class AppModule {}
