import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { Perfis } from '@app/auth/perfis.decorator';
import { ClienteServicosService } from '@app/integracao/cliente-servicos.service';
import { enviarRespostaInterna } from '@app/integracao/responder-interno';

@Controller('consultas')
export class ConsultasController {
  constructor(private readonly servicos: ClienteServicosService) {}

  @Post()
  @Perfis('GESTOR', 'TECNICO')
  async consultar(
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const upstream = await this.servicos.requisitar('ANALISE', 'v1/consultas', request, {
      metodo: 'POST',
      corpo: body,
      preservarQuery: false,
    });
    return enviarRespostaInterna(response, upstream, upstream.body, request.header('x-request-id'));
  }
}
