import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from '@app/health/health.controller';
import { RegioesController } from '@app/regioes/regioes.controller';
import { REPOSITORIO_REGIOES } from '@domain/regiao';
import { RepositorioRegioesTypeorm } from '@infra/db/repositories/regiao.repository';
import { ListarRegioes, ObterRegiao } from '@use-cases/regioes';

import { GlobalModule } from './global.module';

@Module({
  imports: [GlobalModule, TerminusModule],
  controllers: [HealthController, RegioesController],
  providers: [
    { provide: REPOSITORIO_REGIOES, useClass: RepositorioRegioesTypeorm },
    ListarRegioes,
    ObterRegiao,
  ],
})
export class AppModule {}
