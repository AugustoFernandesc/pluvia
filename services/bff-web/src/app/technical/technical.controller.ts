import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';

import { Perfis } from '@app/auth/perfis.decorator';

@Controller('_system')
export class TechnicalController {
  @Get('authorization-check')
  @Perfis('GESTOR', 'TECNICO')
  verificarAutorizacao(@Req() request: Request & { user?: { roles: string[] } }) {
    return {
      component: 'bff-web',
      kind: 'technical-check',
      authenticated: true,
      roles: request.user?.roles ?? [],
      gatewayConsumerDiagnostic: request.header('x-consumer-username') ?? null,
      gatewayRateLimitSubjectHeaderPresent: Boolean(
        request.header('x-pluvia-ratelimit-subject'),
      ),
    };
  }

  @Get('tecnico')
  @Perfis('TECNICO')
  verificarPerfilTecnico() {
    return { component: 'bff-web', kind: 'technical-role-check', role: 'TECNICO' };
  }
}
