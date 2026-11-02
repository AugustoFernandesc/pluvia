import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';

import { Perfis } from '@app/auth/perfis.decorator';

@Controller('_system')
export class TechnicalController {
  @Get('authorization-check')
  @Perfis('AGENTE')
  verificarAutorizacao(@Req() request: Request & { user?: { roles: string[] } }) {
    return {
      component: 'bff-mobile',
      kind: 'technical-check',
      authenticated: true,
      roles: request.user?.roles ?? [],
      gatewayConsumerDiagnostic: request.header('x-consumer-username') ?? null,
    };
  }
}
