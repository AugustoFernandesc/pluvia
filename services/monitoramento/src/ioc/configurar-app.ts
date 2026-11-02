import { INestApplication } from '@nestjs/common';

export function configurarApp(app: INestApplication): void {
  app.setGlobalPrefix('v1', { exclude: ['health'] });
}
