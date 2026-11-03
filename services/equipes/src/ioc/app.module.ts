import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from '@app/health/health.controller';

import { GlobalModule } from './global.module';

@Module({
  imports: [GlobalModule, TerminusModule],
  controllers: [HealthController],
})
export class AppModule {}
