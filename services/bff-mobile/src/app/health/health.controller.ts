import { Controller, Get } from '@nestjs/common';

import { Publico } from '@app/auth/publico.decorator';

@Controller('health')
export class HealthController {
  @Get()
  @Publico()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
