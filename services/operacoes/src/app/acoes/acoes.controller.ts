import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseFilters,
} from '@nestjs/common';
import { Response } from 'express';

import { ProblemaFilter } from '@app/problema.filter';
import { ehEstadoAcao, ehUuid, lerNovaAcao, representar } from '@domain/acao';
import { ListarAcoes, ObterAcao, ObterSaga } from '@use-cases/consultas';
import { Orquestrador } from '@use-cases/orquestrador';

const HAL = 'application/hal+json';

function inteiro(valor: string | undefined, nome: string, padrao: number, maximo?: number): number {
  if (valor === undefined) return padrao;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || (maximo !== undefined && numero > maximo)) {
    const limite = maximo ? ` e ${maximo}` : '';
    throw new BadRequestException(`${nome} deve ser um inteiro entre 1${limite}.`);
  }
  return numero;
}

@Controller('acoes')
@UseFilters(ProblemaFilter)
export class AcoesController {
  constructor(
    private readonly orquestrador: Orquestrador,
    private readonly listarAcoes: ListarAcoes,
    private readonly obterAcao: ObterAcao,
    private readonly obterSaga: ObterSaga,
  ) {}

  /** 202: a ação nasce PENDENTE e o resultado depende da SAGA. */
  @Post()
  @HttpCode(202)
  @Header('Content-Type', HAL)
  async solicitar(@Body() corpo: unknown, @Res({ passthrough: true }) resposta: Response) {
    const nova = lerNovaAcao(corpo);
    if (Array.isArray(nova)) throw new BadRequestException(nova.join(' '));
    const acao = await this.orquestrador.solicitar(nova);
    resposta.location(`/v1/acoes/${acao.id}`);
    return representar(acao);
  }

  @Get()
  @Header('Content-Type', HAL)
  async listar(
    @Query('estado') estado?: string,
    @Query('regiaoId') regiaoId?: string,
    @Query('pagina') pagina?: string,
    @Query('tamanho') tamanho?: string,
  ) {
    if (estado !== undefined && !ehEstadoAcao(estado)) throw new BadRequestException('estado inválido.');
    if (regiaoId !== undefined && !ehUuid(regiaoId)) throw new BadRequestException('regiaoId deve ser um UUID.');
    const filtro = {
      estado,
      regiaoId,
      pagina: inteiro(pagina, 'pagina', 1),
      tamanho: inteiro(tamanho, 'tamanho', 20, 100),
    };
    const { itens, total } = await this.listarAcoes.executar(filtro);
    return { itens: itens.map(representar), pagina: filtro.pagina, tamanho: filtro.tamanho, total };
  }

  @Get(':acaoId')
  @Header('Content-Type', HAL)
  async obter(@Param('acaoId', new ParseUUIDPipe()) acaoId: string) {
    return representar(await this.obterAcao.executar(acaoId));
  }

  @Get(':acaoId/saga')
  async saga(@Param('acaoId', new ParseUUIDPipe()) acaoId: string) {
    const { saga, passos } = await this.obterSaga.executar(acaoId);
    return {
      sagaId: saga.id,
      acaoId: saga.acaoId,
      estado: saga.estado,
      motivo: saga.motivo,
      equipeId: saga.equipeId,
      recursoId: saga.recursoId,
      passos,
      iniciadaEm: saga.iniciadaEm,
      encerradaEm: saga.encerradaEm,
    };
  }

  @Post(':acaoId/cancelamento')
  @HttpCode(200)
  @Header('Content-Type', HAL)
  async cancelar(@Param('acaoId', new ParseUUIDPipe()) acaoId: string, @Body() corpo: unknown) {
    const motivo = (corpo as { motivo?: unknown } | undefined)?.motivo;
    if (typeof motivo !== 'string' || motivo.trim().length < 5 || motivo.length > 500) {
      throw new BadRequestException('motivo deve ter entre 5 e 500 caracteres.');
    }
    return representar(await this.orquestrador.cancelar(acaoId, motivo.trim()));
  }
}
