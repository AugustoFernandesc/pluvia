import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { validarAmbiente } from '@infra/config/validar-ambiente';
import {
  BANCO_ESCRITA,
  BANCO_LEITURA,
  criarOpcoesDoBanco,
  NomeDoBanco,
} from '@infra/db/conn/data-source';

function conexaoTypeOrm(nome: NomeDoBanco) {
  const prefixo = `POSTGRES_${nome.toUpperCase()}`;
  return TypeOrmModule.forRootAsync({
    name: nome,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
      criarOpcoesDoBanco(nome, {
        host: config.getOrThrow(`${prefixo}_HOST`),
        port: config.getOrThrow(`${prefixo}_PORT`),
        database: config.getOrThrow(`${prefixo}_DB`),
        username: config.getOrThrow(`${prefixo}_USER`),
        password: config.getOrThrow(`${prefixo}_PASSWORD`),
      }),
  });
}

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validarAmbiente,
    }),
    conexaoTypeOrm(BANCO_ESCRITA),
    conexaoTypeOrm(BANCO_LEITURA),
  ],
  exports: [ConfigModule, TypeOrmModule],
})
export class GlobalModule {}
