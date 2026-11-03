import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { validarAmbiente } from '@infra/config/validar-ambiente';
import { criarOpcoesDoBanco } from '@infra/db/conn/data-source';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validarAmbiente,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        criarOpcoesDoBanco({
          POSTGRES_HOST: config.getOrThrow('POSTGRES_HOST'),
          POSTGRES_PORT: config.getOrThrow('POSTGRES_PORT'),
          POSTGRES_DB: config.getOrThrow('POSTGRES_DB'),
          POSTGRES_USER: config.getOrThrow('POSTGRES_USER'),
          POSTGRES_PASSWORD: config.getOrThrow('POSTGRES_PASSWORD'),
        }),
    }),
  ],
  exports: [ConfigModule, TypeOrmModule],
})
export class GlobalModule {}
