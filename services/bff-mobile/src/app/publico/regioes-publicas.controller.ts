import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { Publico } from '@app/auth/publico.decorator';
import { ClienteServicosService, jsonInterno } from '@app/integracao/cliente-servicos.service';
import { enviarRespostaInterna, problemaInterno } from '@app/integracao/responder-interno';

interface PaginaRegioes {
  itens: { id: string; nome: string }[];
  pagina: number;
  tamanho: number;
  total: number;
}

@Controller('publico/regioes')
export class RegioesPublicasController {
  constructor(private readonly servicos: ClienteServicosService) {}

  @Get()
  @Publico()
  async listar(
    @Query('municipio') municipio: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const query = new URLSearchParams({ pagina: '1', tamanho: '100' });
    if (municipio) query.set('municipio', municipio);
    const upstream = await this.servicos.requisitar(
      'TERRITORIO',
      `v1/regioes?${query.toString()}`,
      request,
    );
    if (upstream.status < 200 || upstream.status >= 300) {
      return enviarRespostaInterna(response, upstream, request.header('x-request-id'));
    }
    const pagina = jsonInterno<PaginaRegioes>(upstream);
    if (!pagina || !Array.isArray(pagina.itens)) {
      return problemaInterno(
        response,
        502,
        'Resposta inválida de dependência',
        'Território retornou uma lista de regiões inválida.',
        request.path,
        request.header('x-request-id'),
      );
    }
    if (request.header('x-request-id')) response.setHeader('X-Request-ID', request.header('x-request-id')!);
    return response.status(200).json({
      itens: pagina.itens.map(({ id, nome }) => ({ id, nome })),
      pagina: pagina.pagina,
      tamanho: pagina.tamanho,
      total: pagina.total,
    });
  }
}
