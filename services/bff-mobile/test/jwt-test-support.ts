import { generateKeyPairSync } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { createServer, Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import jwt from 'jsonwebtoken';

import { configurarApp } from '@ioc/configurar-app';

export const issuer = 'http://issuer.test/realms/pluvia';
export const audience = 'pluvia-bff-mobile';
export const kid = 'unit-test-rsa-key';

export interface BffTestContext {
  app: INestApplication;
  signToken(roles: string[], expiration?: number): Promise<string>;
  close(): Promise<void>;
}

export async function startBffForAuthTests(): Promise<BffTestContext> {
  const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = keyPair.publicKey.export({ format: 'jwk' });
  const server: Server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        keys: [{ ...publicJwk, kid, alg: 'RS256', use: 'sig' }],
      }),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const jwksPort = (server.address() as AddressInfo).port;

  process.env.PORT = '3000';
  process.env.KEYCLOAK_ISSUER = issuer;
  process.env.KEYCLOAK_JWKS_URL = `http://127.0.0.1:${jwksPort}/jwks`;
  process.env.OIDC_AUDIENCE = audience;

  const { AppModule } = await import('@ioc/app.module');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  configurarApp(app);
  await app.init();

  return {
    app,
    async signToken(roles: string[], expiration = 300): Promise<string> {
      return jwt.sign(
        { realm_access: { roles } },
        keyPair.privateKey,
        {
          algorithm: 'RS256',
          keyid: kid,
          issuer,
          audience,
          subject: 'test-user',
          expiresIn: expiration,
        },
      );
    },
    async close(): Promise<void> {
      await app.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
