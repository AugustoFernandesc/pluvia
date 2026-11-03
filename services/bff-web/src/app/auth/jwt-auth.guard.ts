import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { PrincipalJwt, JwtVerifierService } from './jwt-verifier.service';
import { ROTA_PUBLICA } from './publico.decorator';

type RequestComPrincipal = Request & { user?: PrincipalJwt };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtVerifierService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(ROTA_PUBLICA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (publico) return true;

    const request = context.switchToHttp().getRequest<RequestComPrincipal>();
    const authorization = request.headers.authorization;
    const correspondencia =
      typeof authorization === 'string'
        ? /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization)
        : null;
    if (!correspondencia) {
      throw new UnauthorizedException('Envie um token Bearer válido.');
    }

    request.user = await this.jwt.verificar(correspondencia[1]);
    return true;
  }
}
