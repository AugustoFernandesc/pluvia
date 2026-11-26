import { createHash } from 'node:crypto';
import { Controller, Get, Headers, Param, ParseUUIDPipe, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { Publico } from '@app/auth/publico.decorator';
import { ClienteServicosService, jsonInterno, RespostaInterna } from '@app/integracao/cliente-servicos.service';
import { enviarRespostaInterna, problemaInterno } from '@app/integracao/responder-interno';
import { criarResumoRegiao, PanoramaRegiao, RegiaoTerritorio } from './resumo-regiao';

@Controller('publico/regioes')
export class ResumoPublicoController {
  constructor(private readonly servicos: ClienteServicosService) {}

  @Get(':regiaoId/resumo')
  @Publico()
  async obter(
    @Param('regiaoId', new ParseUUIDPipe()) regiaoId: string,
    @Headers('if-none-match') etagRecebido: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const [territorio, risco] = await Promise.all([
      this.servicos.requisitar('TERRITORIO', `v1/regioes/${regiaoId}`, request),
      this.servicos.requisitar('RISCO', `v1/panoramas/${regiaoId}`, request),
    ]);
    const falha = [territorio, risco].find((item) => item.status < 200 || item.status >= 300);
    if (falha) return this.enviar(request, response, falha);

    const regiao = jsonInterno<RegiaoTerritorio>(territorio);
    const panorama = jsonInterno<PanoramaRegiao>(risco);
    if (!regiao || !panorama) {
      return problemaInterno(
        response,
        502,
        'Resposta inválida de dependência',
        'Território ou Risco retornou dados incompletos para montar o resumo público.',
        request.path,
        request.header('x-request-id'),
      );
    }

    let resumo;
    try {
      resumo = criarResumoRegiao(regiao, panorama);
    } catch (erro) {
      return problemaInterno(
        response,
        502,
        'Resumo indisponível',
        erro instanceof Error ? erro.message : 'Os dados atuais não permitem montar um resumo confiável.',
        request.path,
        request.header('x-request-id'),
      );
    }

    const corpo = Buffer.from(JSON.stringify(resumo));
    const etag = `"${createHash('sha256').update(corpo).digest('base64url')}"`;
    response.setHeader('ETag', etag);
    response.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    if (etagRecebido?.split(',').map((valor) => valor.trim()).some((valor) => valor === '*' || valor === etag)) {
      return response.status(304).end();
    }
    response.status(200).type('application/json');
    if (request.header('x-request-id')) response.setHeader('X-Request-ID', request.header('x-request-id')!);
    return response.send(corpo);
  }

  private enviar(request: Request, response: Response, upstream: RespostaInterna): Response {
    return enviarRespostaInterna(response, upstream, request.header('x-request-id'));
  }
}
