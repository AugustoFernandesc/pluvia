import { Controller, Get, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { Perfis } from '@app/auth/perfis.decorator';
import { ClienteServicosService, jsonInterno, RespostaInterna } from '@app/integracao/cliente-servicos.service';
import { enviarRespostaInterna, problemaInterno } from '@app/integracao/responder-interno';

interface PanoramaResumo {
  regiaoId: string;
  regiaoNome: string;
  nivelAtencao: string;
  sinalizacoesAbertas: number;
  atualizadoEm: string;
}

interface PaginaPanoramas {
  itens: PanoramaResumo[];
}

@Controller()
export class PainelController {
  constructor(private readonly servicos: ClienteServicosService) {}

  @Get('painel')
  @Perfis('GESTOR', 'TECNICO')
  async obter(@Req() request: Request, @Res() response: Response): Promise<Response> {
    const query = new URLSearchParams({ pagina: '1', tamanho: '100' });
    const municipio = typeof request.query.municipio === 'string' ? request.query.municipio : undefined;
    if (municipio) query.set('municipio', municipio);
    const [risco, operacoes] = await Promise.all([
      this.servicos.requisitar('RISCO', `v1/panoramas?${query.toString()}`, request, { preservarQuery: false }),
      this.servicos.requisitar('OPERACOES', 'v1/acoes?tamanho=100', request, { preservarQuery: false }),
    ]);
    if (risco.status < 200 || risco.status >= 300) {
      return enviarRespostaInterna(response, risco, risco.body, request.header('x-request-id'));
    }

    const pagina = jsonInterno<PaginaPanoramas>(risco);
    if (!pagina || !Array.isArray(pagina.itens)) {
      return problemaInterno(
        response,
        502,
        'Resposta inválida de dependência',
        'Risco retornou uma página de panoramas inválida.',
        request.path,
        request.header('x-request-id'),
      );
    }

    const acoes = this.listarAcoes(operacoes);
    const acoesPorRegiao = new Map<string, number>();
    for (const acao of acoes.itens) {
      if (typeof acao.regiaoId !== 'string') continue;
      if (!['PENDENTE', 'CONFIRMADA', 'EM_EXECUCAO'].includes(String(acao.estado))) continue;
      acoesPorRegiao.set(acao.regiaoId, (acoesPorRegiao.get(acao.regiaoId) ?? 0) + 1);
    }

    const porNivel: Record<string, number> = {
      NORMAL: 0,
      OBSERVACAO: 0,
      ATENCAO: 0,
      ALTA_ATENCAO: 0,
    };
    for (const panorama of pagina.itens) {
      if (panorama.nivelAtencao in porNivel) porNivel[panorama.nivelAtencao] += 1;
    }

    const avisos: string[] = [];
    const acoesDisponiveis = operacoes.status >= 200 && operacoes.status < 300 && acoes.completas;
    if (!acoesDisponiveis) avisos.push('Operações ainda não disponibiliza uma lista completa de ações.');

    const atualizadoEm = pagina.itens
      .map((item) => item.atualizadoEm)
      .filter((valor): valor is string => typeof valor === 'string')
      .sort()
      .at(-1) ?? new Date().toISOString();

    if (request.header('x-request-id')) response.setHeader('X-Request-ID', request.header('x-request-id')!);
    return response.status(200).json({
      regioes: pagina.itens.map((item) => ({
        regiaoId: item.regiaoId,
        nome: item.regiaoNome,
        nivelAtencao: item.nivelAtencao,
        sinalizacoesAbertas: item.sinalizacoesAbertas,
        acoesAbertas: acoesDisponiveis ? acoesPorRegiao.get(item.regiaoId) ?? 0 : null,
        atualizadoEm: item.atualizadoEm,
      })),
      contadores: {
        porNivel,
        sinalizacoesAbertas: pagina.itens.reduce((total, item) => total + item.sinalizacoesAbertas, 0),
        acoesEmAndamento: acoesDisponiveis
          ? acoes.itens.filter((acao) => ['PENDENTE', 'CONFIRMADA', 'EM_EXECUCAO'].includes(String(acao.estado))).length
          : null,
      },
      atualizadoEm,
      avisos,
    });
  }

  private listarAcoes(resposta: RespostaInterna): { itens: Record<string, unknown>[]; completas: boolean } {
    if (resposta.status < 200 || resposta.status >= 300) return { itens: [], completas: false };
    const body = jsonInterno<Record<string, unknown>>(resposta);
    if (!body) return { itens: [], completas: false };
    const embedded = body._embedded as Record<string, unknown> | undefined;
    const itens = Array.isArray(body.itens)
      ? body.itens as Record<string, unknown>[]
      : Array.isArray(embedded?.acoes)
        ? embedded.acoes as Record<string, unknown>[]
        : [];
    const total = typeof body.total === 'number' ? body.total : itens.length;
    return { itens, completas: total <= itens.length };
  }
}
