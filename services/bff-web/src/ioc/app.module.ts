import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { HealthController } from '@app/health/health.controller';
import { JwtAuthGuard } from '@app/auth/jwt-auth.guard';
import { JwtVerifierService } from '@app/auth/jwt-verifier.service';
import { RolesGuard } from '@app/auth/roles.guard';
import { RequestLoggingMiddleware } from '@app/auth/request-logging.middleware';
import { TechnicalController } from '@app/technical/technical.controller';

import { GlobalModule } from './global.module';

@Module({
  imports: [GlobalModule],
  controllers: [HealthController, TechnicalController],
  providers: [
    JwtVerifierService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    RequestLoggingMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
