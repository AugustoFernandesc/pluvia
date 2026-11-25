import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';

import { TAMANHO_MAXIMO, TAMANHO_PADRAO, inteiro, umDe } from '@app/parametros';
import { ProblemaFilter } from '@app/problema.filter';
import { Pagina, Sinalizacao } from '@domain/sinalizacao';
import {
  ListarSinalizacoes,
  ObterSinalizacao,
  ReconhecerSinalizacao,
} from '@use-cases/sinalizacoes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS = ['ABERTA', 'RECONHECIDA', 'ENCERRADA'] as const;
const ORIGENS = ['OBSERVADO', 'PREVISTO'] as const;

/**
 * Sinalizações: o comando e as consultas leem e escrevem no banco de ESCRITA.
 * As consultas ficam aqui de propósito: quem acabou de reconhecer vê o estado
 * novo na hora, sem esperar a projeção.
 */
@Controller('sinalizacoes')
@UseFilters(ProblemaFilter)
export class SinalizacoesController {
  constructor(
    private readonly reconhecerSinalizacao: ReconhecerSinalizacao,
    private readonly listarSinalizacoes: ListarSinalizacoes,
    private readonly obterSinalizacao: ObterSinalizacao,
  ) {}

  @Get()
  listar(
    @Query('estado') estado?: string,
    @Query('regiaoId') regiaoId?: string,
    @Query('origem') origem?: string,
    @Query('pagina') pagina?: string,
    @Query('tamanho') tamanho?: string,
  ): Promise<Pagina<Sinalizacao>> {
    if (regiaoId !== undefined && !UUID.test(regiaoId)) {
      throw new BadRequestException('regiaoId deve ser um uuid.');
    }
    return this.listarSinalizacoes.executar({
      estado: umDe(estado, 'estado', ESTADOS),
      regiaoId,
      origem: umDe(origem, 'origem', ORIGENS),
      pagina: inteiro(pagina, 'pagina', 1),
      tamanho: inteiro(tamanho, 'tamanho', TAMANHO_PADRAO, TAMANHO_MAXIMO),
    });
  }

  @Get(':sinalizacaoId')
  obter(@Param('sinalizacaoId', new ParseUUIDPipe()) sinalizacaoId: string): Promise<Sinalizacao> {
    return this.obterSinalizacao.executar(sinalizacaoId);
  }

  /**
   * Comando. `X-Request-ID` (do gateway) vira o correlationId do evento.
   * `X-Usuario-Id`, se o BFF mandar, vira o reconhecidaPor.
   */
  @Post(':sinalizacaoId/reconhecimento')
  @HttpCode(200)
  reconhecer(
    @Param('sinalizacaoId', new ParseUUIDPipe()) sinalizacaoId: string,
    @Headers('x-request-id') requestId?: string,
    @Headers('x-usuario-id') usuarioId?: string,
  ): Promise<Sinalizacao> {
    return this.reconhecerSinalizacao.executar({
      sinalizacaoId,
      reconhecidaPor: usuarioId && UUID.test(usuarioId) ? usuarioId : null,
      correlationId: requestId && UUID.test(requestId) ? requestId : undefined,
    });
  }
}
