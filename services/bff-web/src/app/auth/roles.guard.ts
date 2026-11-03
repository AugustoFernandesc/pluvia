import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { PERFIS_PERMITIDOS, Perfil } from './perfis.decorator';
import { PrincipalJwt } from './jwt-verifier.service';

type RequestComPrincipal = Request & { user?: PrincipalJwt };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const perfis = this.reflector.getAllAndOverride<Perfil[]>(PERFIS_PERMITIDOS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!perfis?.length) return true;

    const request = context.switchToHttp().getRequest<RequestComPrincipal>();
    if (!request.user) throw new ForbiddenException('Perfil sem permissão.');
    if (!perfis.some((perfil) => request.user?.roles.includes(perfil))) {
      throw new ForbiddenException('Perfil sem permissão para esta operação.');
    }
    return true;
  }
}
