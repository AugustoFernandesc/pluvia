import { Controller, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { Perfis } from '@app/auth/perfis.decorator';
import { RequestComPrincipal } from '@app/auth/principal-request';
import { ClienteServicosService } from '@app/integracao/cliente-servicos.service';
import { enviarRespostaInterna } from '@app/integracao/responder-interno';

@Controller('sinalizacoes')
export class SinalizacoesController {
  constructor(private readonly servicos: ClienteServicosService) {}

  @Post(':sinalizacaoId/reconhecimento')
  @Perfis('TECNICO')
  async reconhecer(
    @Param('sinalizacaoId', new ParseUUIDPipe()) sinalizacaoId: string,
    @Req() request: RequestComPrincipal,
    @Res() response: Response,
  ): Promise<Response> {
    const upstream = await this.servicos.requisitar(
      'RISCO',
      `v1/sinalizacoes/${sinalizacaoId}/reconhecimento`,
      request as Request,
      {
        metodo: 'POST',
        preservarQuery: false,
        usuarioVerificado: request.user?.sub,
      },
    );
    return enviarRespostaInterna(response, upstream, upstream.body, request.header('x-request-id'));
  }
}
