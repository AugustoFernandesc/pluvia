import { createPublicKey, JsonWebKey } from 'node:crypto';
import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt, { JwtPayload } from 'jsonwebtoken';

export interface PrincipalJwt {
  sub: string;
  roles: string[];
}

interface SigningJwk extends JsonWebKey {
  kid: string;
  alg?: string;
  use?: string;
}

@Injectable()
export class JwtVerifierService {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly jwksUrl: string;
  private signingKeys = new Map<string, string>();
  private cacheExpiresAt = 0;
  private lastUnknownKidRefreshAt = 0;
  private refreshInFlight?: Promise<void>;

  constructor(config: ConfigService) {
    this.issuer = config.getOrThrow<string>('KEYCLOAK_ISSUER');
    this.audience = config.getOrThrow<string>('OIDC_AUDIENCE');
    this.jwksUrl = config.getOrThrow<string>('KEYCLOAK_JWKS_URL');
  }

  async verificar(token: string): Promise<PrincipalJwt> {
    let decoded: ReturnType<typeof jwt.decode>;
    try {
      decoded = jwt.decode(token, { complete: true });
    } catch {
      throw new UnauthorizedException('JWT ausente, inválido ou expirado.');
    }
    if (
      !decoded ||
      typeof decoded === 'string' ||
      typeof decoded.payload === 'string' ||
      decoded.header.alg !== 'RS256' ||
      typeof decoded.header.kid !== 'string' ||
      typeof decoded.payload.exp !== 'number' ||
      typeof decoded.payload.iat !== 'number' ||
      typeof decoded.payload.sub !== 'string' ||
      decoded.payload.sub.length === 0
    ) {
      throw new UnauthorizedException('JWT ausente, inválido ou expirado.');
    }

    const publicKey = await this.getPublicKey(decoded.header.kid);
    let payload: JwtPayload;
    try {
      const verified = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        issuer: this.issuer,
        audience: this.audience,
        maxAge: '5m',
        clockTolerance: 5,
      });
      if (typeof verified === 'string') {
        throw new UnauthorizedException('JWT com payload inválido.');
      }
      payload = verified;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      if (
        error instanceof Error &&
        ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)
      ) {
        throw new UnauthorizedException('JWT ausente, inválido ou expirado.');
      }
      throw new ServiceUnavailableException('Falha ao verificar o JWT.');
    }

    const realmAccess = payload.realm_access;
    const rolesValue =
      typeof realmAccess === 'object' && realmAccess !== null
        ? (realmAccess as Record<string, unknown>).roles
        : undefined;
    const roles = Array.isArray(rolesValue)
      ? rolesValue.filter((role: unknown): role is string => typeof role === 'string')
      : [];

    return { sub: payload.sub as string, roles };
  }

  private async getPublicKey(kid: string): Promise<string> {
    const now = Date.now();
    if (now < this.cacheExpiresAt) {
      const cachedKey = this.signingKeys.get(kid);
      if (cachedKey) return cachedKey;
      if (now - this.lastUnknownKidRefreshAt < 10_000) {
        throw new UnauthorizedException('JWT assinado por uma chave desconhecida.');
      }
    }

    // Refresh once per interval so arbitrary JWT kid values cannot turn a
    // cached JWKS miss into an unbounded request stream to Keycloak.
    this.lastUnknownKidRefreshAt = now;
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refreshKeys().finally(() => {
        this.refreshInFlight = undefined;
      });
    }
    await this.refreshInFlight;

    const key = this.signingKeys.get(kid);
    if (!key) {
      throw new UnauthorizedException('JWT assinado por uma chave desconhecida.');
    }
    return key;
  }

  private async refreshKeys(): Promise<void> {
    let response: Response;
    try {
      response = await fetch(this.jwksUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3_000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Não foi possível consultar as chaves públicas do Keycloak.',
      );
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Keycloak JWKS respondeu HTTP ' + response.status + '.',
      );
    }

    let document: { keys?: unknown[] };
    try {
      document = (await response.json()) as { keys?: unknown[] };
    } catch {
      throw new ServiceUnavailableException('O Keycloak retornou um JWKS inválido.');
    }
    if (!Array.isArray(document.keys)) {
      throw new ServiceUnavailableException('O Keycloak retornou um JWKS inválido.');
    }

    const keys = new Map<string, string>();
    for (const value of document.keys) {
      if (
        typeof value !== 'object' ||
        value === null ||
        !('kid' in value) ||
        typeof value.kid !== 'string' ||
        !('kty' in value) ||
        value.kty !== 'RSA' ||
        ('alg' in value && value.alg !== 'RS256') ||
        ('use' in value && value.use !== 'sig')
      ) {
        continue;
      }
      try {
        const publicKey = createPublicKey({
          key: value as SigningJwk,
          format: 'jwk',
        });
        if ((publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) continue;
        keys.set(value.kid, publicKey.export({ type: 'spki', format: 'pem' }).toString());
      } catch {
        // Ignore malformed or unsupported JWKS entries; use only valid RSA keys.
      }
    }
    if (keys.size === 0) {
      throw new ServiceUnavailableException(
        'O Keycloak não publicou uma chave de assinatura RSA RS256 utilizável.',
      );
    }
    this.signingKeys = keys;
    this.cacheExpiresAt = Date.now() + 5 * 60 * 1000;
  }
}
