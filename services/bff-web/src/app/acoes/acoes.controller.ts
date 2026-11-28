import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { Perfis } from '@app/auth/perfis.decorator';
import { ClienteServicosService, jsonInterno } from '@app/integracao/cliente-servicos.service';
import { enviarRespostaInterna } from '@app/integracao/responder-interno';
import { reescreverLinksHateoas, reescreverUrlOperacoes } from '@app/hateoas/reescrever-links';

@Controller('acoes')
export class AcoesController {
  constructor(private readonly servicos: ClienteServicosService) {}

  @Get()
  @Perfis('GESTOR', 'TECNICO')
  async listar(@Req() request: Request, @Res() response: Response): Promise<Response> {
    const upstream = await this.servicos.requisitar('OPERACOES', 'v1/acoes', request);
    return this.enviarOperacoes(request, response, upstream);
  }

  @Post()
  @Perfis('GESTOR')
  async criar(
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const upstream = await this.servicos.requisitar('OPERACOES', 'v1/acoes', request, {
      metodo: 'POST',
      corpo: body,
      preservarQuery: false,
      idempotencyKey: true,
    });
    return this.enviarOperacoes(request, response, upstream);
  }

  @Get(':acaoId/saga')
  @Perfis('GESTOR', 'TECNICO')
  async saga(
    @Param('acaoId', new ParseUUIDPipe()) acaoId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const upstream = await this.servicos.requisitar(
      'OPERACOES',
      `v1/acoes/${acaoId}/saga`,
      request,
    );
    return enviarRespostaInterna(response, upstream, upstream.body, request.header('x-request-id'));
  }

  @Get(':acaoId')
  @Perfis('GESTOR', 'TECNICO')
  async obter(
    @Param('acaoId', new ParseUUIDPipe()) acaoId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const upstream = await this.servicos.requisitar(
      'OPERACOES',
      `v1/acoes/${acaoId}`,
      request,
    );
    return this.enviarOperacoes(request, response, upstream);
  }

  private enviarOperacoes(request: Request, response: Response, upstream: Awaited<ReturnType<ClienteServicosService['requisitar']>>): Response {
    const contentType = upstream.headers['content-type'] ?? '';
    const headers = { ...upstream.headers };
    if (headers.location) {
      headers.location = reescreverUrlOperacoes(headers.location, this.servicos.url('OPERACOES'));
    }
    const respostaPublica = { ...upstream, headers };
    const body = jsonInterno<unknown>(upstream);
    if (upstream.status >= 200 && upstream.status < 300 && body !== undefined &&
      (contentType.includes('hal+json') || contentType.includes('json'))) {
      const reescrito = reescreverLinksHateoas(body, this.servicos.url('OPERACOES'));
      return enviarRespostaInterna(
        response,
        respostaPublica,
        Buffer.from(JSON.stringify(reescrito)),
        request.header('x-request-id'),
      );
    }
    return enviarRespostaInterna(response, respostaPublica, upstream.body, request.header('x-request-id'));
  }
}
