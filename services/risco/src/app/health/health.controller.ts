import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { BANCO_ESCRITA, BANCO_LEITURA } from '@infra/db/conn/data-source';

/**
 * Verifica os dois bancos. Se qualquer um cair, o `/health` responde 503 e o
 * corpo diz qual deles está fora (`escrita` ou `leitura`).
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    @InjectDataSource(BANCO_ESCRITA) private readonly escrita: DataSource,
    @InjectDataSource(BANCO_LEITURA) private readonly leitura: DataSource,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck(BANCO_ESCRITA, { connection: this.escrita }),
      () => this.db.pingCheck(BANCO_LEITURA, { connection: this.leitura }),
    ]);
  }
}
