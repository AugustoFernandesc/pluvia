import { Controller, Get, Param, ParseUUIDPipe, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { Perfis } from '@app/auth/perfis.decorator';
import { ClienteServicosService } from '@app/integracao/cliente-servicos.service';
import { enviarRespostaInterna } from '@app/integracao/responder-interno';

@Controller('panoramas')
export class PanoramasController {
  constructor(private readonly servicos: ClienteServicosService) {}

  /** Lê só o modelo de leitura do Risco, sem chamar a Análise nem outros serviços. */
  @Get(':regiaoId')
  @Perfis('GESTOR', 'TECNICO')
  async obter(
    @Param('regiaoId', new ParseUUIDPipe()) regiaoId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const upstream = await this.servicos.requisitar('RISCO', `v1/panoramas/${regiaoId}`, request, {
      preservarQuery: false,
    });
    return enviarRespostaInterna(response, upstream, upstream.body, request.header('x-request-id'));
  }
}
