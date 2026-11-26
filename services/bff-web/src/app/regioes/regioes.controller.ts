import { Controller, Get, Param, ParseUUIDPipe, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { Perfis } from '@app/auth/perfis.decorator';
import { ClienteServicosService, jsonInterno, RespostaInterna } from '@app/integracao/cliente-servicos.service';
import { enviarRespostaInterna, problemaInterno } from '@app/integracao/responder-interno';

interface Pagina<T> {
  itens?: T[];
  total?: number;
  _embedded?: { acoes?: T[] };
}

@Controller('regioes')
export class RegioesController {
  constructor(private readonly servicos: ClienteServicosService) {}

  @Get(':regiaoId')
  @Perfis('GESTOR', 'TECNICO')
  async obter(
    @Param('regiaoId', new ParseUUIDPipe()) regiaoId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const [territorio, risco] = await Promise.all([
      this.servicos.requisitar('TERRITORIO', `v1/regioes/${regiaoId}`, request),
      this.servicos.requisitar('RISCO', `v1/panoramas/${regiaoId}`, request),
    ]);
    const falhaObrigatoria = [territorio, risco].find((item) => item.status < 200 || item.status >= 300);
    if (falhaObrigatoria) return this.enviar(request, response, falhaObrigatoria);

    const regiao = jsonInterno<Record<string, unknown>>(territorio);
    const panorama = jsonInterno<Record<string, unknown>>(risco);
    if (!regiao || !panorama) {
      return problemaInterno(
        response,
        502,
        'Resposta inválida de dependência',
        'Território ou Risco retornou dados que não puderam ser interpretados.',
        request.path,
        request.header('x-request-id'),
      );
    }

    const [vulnerabilidade, ocorrencias, acoes, analise] = await Promise.all([
      this.servicos.requisitar('TERRITORIO', `v1/regioes/${regiaoId}/vulnerabilidade`, request),
      this.servicos.requisitar(
        'TERRITORIO',
        `v1/ocorrencias?regiaoId=${encodeURIComponent(regiaoId)}`,
        request,
        { preservarQuery: false },
      ),
      this.servicos.requisitar(
        'OPERACOES',
        `v1/acoes?regiaoId=${encodeURIComponent(regiaoId)}&tamanho=100`,
        request,
        { preservarQuery: false },
      ),
      this.servicos.requisitar(
        'ANALISE',
        'v1/analises',
        request,
        {
          metodo: 'POST',
          corpo: { regiaoId, tipo: 'SITUACAO_ATUAL' },
          timeoutMs: this.servicos.timeoutAnaliseRegional,
        },
      ),
    ]);

    const avisos: string[] = [];
    const vulnerabilidadeBody = this.opcional<Record<string, unknown>>(
      vulnerabilidade,
      avisos,
      'Território ainda não disponibiliza os indicadores de vulnerabilidade neste fluxo.',
    );
    const ocorrenciasBody = this.opcional<Pagina<Record<string, unknown>> | Record<string, unknown>[]>(
      ocorrencias,
      avisos,
      'Território ainda não disponibiliza ocorrências recentes neste fluxo.',
    );
    const acoesBody = this.opcional<Pagina<Record<string, unknown>> | Record<string, unknown>[]>(
      acoes,
      avisos,
      'Operações ainda não disponibiliza a consulta de ações para esta região.',
    );
    const analiseBody = this.opcional<Record<string, unknown>>(
      analise,
      avisos,
      'Análise ainda não disponibiliza a síntese por região neste fluxo.',
    );

    const ocorrenciasItens = this.itens(ocorrenciasBody);
    const acoesItens = this.itens(acoesBody);
    const acoesCompletas = acoesBody && !Array.isArray(acoesBody) &&
      typeof acoesBody.total === 'number' && acoesItens.length < acoesBody.total;
    if (acoesCompletas) avisos.push('A lista de ações excede o limite de consulta e não foi resumida.');

    if (request.header('x-request-id')) response.setHeader('X-Request-ID', request.header('x-request-id')!);
    return response.status(200).json({
      regiao,
      panorama,
      cenarioPrevisto: panorama.cenarioPrevisto ?? null,
      vulnerabilidade: vulnerabilidadeBody ?? null,
      ocorrenciasRecentes: ocorrenciasBody === null ? null : ocorrenciasItens,
      acoes:
        acoesBody === null || acoesCompletas
          ? null
          : {
              abertas: acoesItens.filter((acao) => ['PENDENTE', 'CONFIRMADA', 'EM_EXECUCAO'].includes(String(acao.estado))).length,
              itens: acoesItens,
            },
      analise:
        analiseBody && typeof analiseBody.sintese === 'string'
          ? {
              sintese: analiseBody.sintese,
              fontes: Array.isArray(analiseBody.fontes) ? analiseBody.fontes : [],
              origem: analiseBody.origem,
              modelo: analiseBody.modelo ?? null,
              latenciaMs: analiseBody.latenciaMs ?? null,
              geradaEm: analiseBody.geradaEm,
            }
          : null,
      avisos,
    });
  }

  private opcional<T>(resposta: RespostaInterna, avisos: string[], aviso: string): T | null {
    if (resposta.status < 200 || resposta.status >= 300) {
      avisos.push(aviso);
      return null;
    }
    return jsonInterno<T>(resposta) ?? null;
  }

  private itens(
    body: Pagina<Record<string, unknown>> | Record<string, unknown>[] | null,
  ): Record<string, unknown>[] {
    if (Array.isArray(body)) return body;
    return body?.itens ?? body?._embedded?.acoes ?? [];
  }

  private enviar(request: Request, response: Response, upstream: RespostaInterna): Response {
    return enviarRespostaInterna(response, upstream, upstream.body, request.header('x-request-id'));
  }
}
