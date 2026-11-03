import { INestApplication } from '@nestjs/common';

export function configurarApp(app: INestApplication): void {
  app.setGlobalPrefix('web/v1', { exclude: ['health'] });
}
