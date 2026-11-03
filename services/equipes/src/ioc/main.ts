import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from '@ioc/app.module';
import { configurarApp } from '@ioc/configurar-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configurarApp(app);
  const porta = app.get(ConfigService).getOrThrow<number>('PORT');
  await app.listen(porta, '0.0.0.0');
}

bootstrap().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
