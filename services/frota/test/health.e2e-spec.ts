import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { AddressInfo, createServer } from 'net';
import request from 'supertest';

import { configurarApp } from '@ioc/configurar-app';

function obterPortaLivre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const servidor = createServer();
    servidor.once('error', reject);
    servidor.listen(0, () => {
      const { port } = servidor.address() as AddressInfo;
      servidor.close(() => resolve(port));
    });
  });
}

/**
 * Os cenários dependem da ordem: o banco começa de pé, é parado e depois volta,
 * tudo contra a mesma aplicação, que nunca é recriada.
 */
describe('GET /health (e2e)', () => {
  let banco: StartedPostgreSqlContainer;
  let app: INestApplication;
  let portaDoBanco: number;

  beforeAll(async () => {
    // O Docker sorteia outra porta do host quando o container reinicia. A porta
    // fica fixa para a aplicação, que não é recriada, achar o banco de volta.
    portaDoBanco = await obterPortaLivre();
    banco = await new PostgreSqlContainer('postgres:17-alpine')
      .withExposedPorts({ container: 5432, host: portaDoBanco })
      .start();

    process.env.POSTGRES_HOST = banco.getHost();
    process.env.POSTGRES_PORT = String(banco.getPort());
    process.env.POSTGRES_DB = banco.getDatabase();
    process.env.POSTGRES_USER = banco.getUsername();
    process.env.POSTGRES_PASSWORD = banco.getPassword();
    process.env.PORT = '3000';

    // O ConfigModule valida o ambiente ao carregar o módulo, então o AppModule
    // só pode ser importado depois de as variáveis estarem definidas.
    const { AppModule } = await import('@ioc/app.module');
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await banco?.stop();
  });

  describe('com o banco disponível', () => {
    it('responde 200 com database up', async () => {
      const resposta = await request(app.getHttpServer()).get('/health');

      expect(resposta.status).toBe(200);
      expect(resposta.body.status).toBe('ok');
      expect(resposta.body.info.database.status).toBe('up');
    });

    it('expõe /health sem prefixo e responde 404 em /v1/health', async () => {
      const semPrefixo = await request(app.getHttpServer()).get('/health');
      const comPrefixo = await request(app.getHttpServer()).get('/v1/health');

      expect(semPrefixo.status).toBe(200);
      expect(comPrefixo.status).toBe(404);
    });
  });

  describe('com o banco parado', () => {
    it('responde 503 com database down', async () => {
      await banco.stop({ remove: false });

      const resposta = await request(app.getHttpServer()).get('/health');

      expect(resposta.status).toBe(503);
      expect(resposta.body.status).toBe('error');
      expect(resposta.body.error.database.status).toBe('down');
    });
  });

  describe('com o banco de volta', () => {
    it('responde 200 sem recriar a aplicação', async () => {
      await banco.restart();
      expect(banco.getPort()).toBe(portaDoBanco);

      const resposta = await request(app.getHttpServer()).get('/health');

      expect(resposta.status).toBe(200);
      expect(resposta.body.info.database.status).toBe('up');
    });
  });
});
