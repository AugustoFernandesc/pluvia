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
 * Sobe um banco de escrita e um de leitura, cada um com usuário e senha
 * próprios, como no compose. A porta do host fica fixa para a aplicação,
 * que nunca é recriada, achar o banco de volta depois de um restart.
 */
async function subirBanco(
  nome: string,
): Promise<{ banco: StartedPostgreSqlContainer; porta: number }> {
  const porta = await obterPortaLivre();
  const banco = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase(`risco_${nome}`)
    .withUsername(`risco_${nome}`)
    .withPassword(`senha-${nome}`)
    .withExposedPorts({ container: 5432, host: porta })
    .start();
  return { banco, porta };
}

function definirAmbiente(
  prefixo: 'ESCRITA' | 'LEITURA',
  banco: StartedPostgreSqlContainer,
): void {
  process.env[`POSTGRES_${prefixo}_HOST`] = banco.getHost();
  process.env[`POSTGRES_${prefixo}_PORT`] = String(banco.getPort());
  process.env[`POSTGRES_${prefixo}_DB`] = banco.getDatabase();
  process.env[`POSTGRES_${prefixo}_USER`] = banco.getUsername();
  process.env[`POSTGRES_${prefixo}_PASSWORD`] = banco.getPassword();
}

/**
 * Os cenários dependem da ordem: os dois bancos começam de pé, cada um é
 * parado e depois volta, tudo contra a mesma aplicação.
 */
describe('GET /health (e2e)', () => {
  let escrita: { banco: StartedPostgreSqlContainer; porta: number };
  let leitura: { banco: StartedPostgreSqlContainer; porta: number };
  let app: INestApplication;

  beforeAll(async () => {
    [escrita, leitura] = await Promise.all([
      subirBanco('escrita'),
      subirBanco('leitura'),
    ]);

    definirAmbiente('ESCRITA', escrita.banco);
    definirAmbiente('LEITURA', leitura.banco);
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
    await escrita?.banco.stop();
    await leitura?.banco.stop();
  });

  describe('com os dois bancos disponíveis', () => {
    it('responde 200 com escrita e leitura up', async () => {
      const resposta = await request(app.getHttpServer()).get('/health');

      expect(resposta.status).toBe(200);
      expect(resposta.body.status).toBe('ok');
      expect(resposta.body.info.escrita.status).toBe('up');
      expect(resposta.body.info.leitura.status).toBe('up');
    });

    it('expõe /health sem prefixo e responde 404 em /v1/health', async () => {
      const semPrefixo = await request(app.getHttpServer()).get('/health');
      const comPrefixo = await request(app.getHttpServer()).get('/v1/health');

      expect(semPrefixo.status).toBe(200);
      expect(comPrefixo.status).toBe(404);
    });
  });

  describe.each([
    ['escrita', 'leitura'],
    ['leitura', 'escrita'],
  ] as const)('com o banco de %s parado', (parado, dePe) => {
    const alvo = () => (parado === 'escrita' ? escrita : leitura);

    it(`responde 503 com ${parado} down e ${dePe} up`, async () => {
      await alvo().banco.stop({ remove: false });

      const resposta = await request(app.getHttpServer()).get('/health');

      expect(resposta.status).toBe(503);
      expect(resposta.body.status).toBe('error');
      expect(resposta.body.error[parado].status).toBe('down');
      expect(resposta.body.info[dePe].status).toBe('up');
    });

    it('volta a responder 200 sem recriar a aplicação', async () => {
      await alvo().banco.restart();
      expect(alvo().banco.getPort()).toBe(alvo().porta);

      const resposta = await request(app.getHttpServer()).get('/health');

      expect(resposta.status).toBe(200);
      expect(resposta.body.info[parado].status).toBe('up');
    });
  });
});
