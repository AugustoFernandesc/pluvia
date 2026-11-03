import { Controller, Get } from '@nestjs/common';

import { Publico } from '@app/auth/publico.decorator';

@Controller('publico/_system')
export class PublicTechnicalController {
  @Get('status')
  @Publico()
  status() {
    return { component: 'bff-mobile', kind: 'technical-check', access: 'public' };
  }
}
