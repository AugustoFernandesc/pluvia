import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validarAmbiente } from '@infra/config/validar-ambiente';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validarAmbiente,
    }),
  ],
  exports: [ConfigModule],
})
export class GlobalModule {}
