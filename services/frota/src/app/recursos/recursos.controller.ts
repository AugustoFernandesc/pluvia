import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { Categoria, Disponibilidade, Manutencao, Recurso, ehCategoria, ehData } from '@domain/frota';
import {
  ConsultarDisponibilidade,
  ListarRecursos,
  NovaManutencao,
  RegistrarManutencao,
} from '@use-cases/consultas';

function lerCategoria(valor?: string): Categoria | undefined {
  if (valor === undefined) return undefined;
  if (!ehCategoria(valor)) throw new BadRequestException('categoria inválida.');
  return valor;
}

function lerManutencao(corpo: unknown): NovaManutencao {
  const { inicio, fim, motivo } = (corpo ?? {}) as Record<string, unknown>;
  const ehInstante = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
  if (!ehInstante(inicio) || !ehInstante(fim)) {
    throw new BadRequestException('inicio e fim são obrigatórios, em data e hora ISO 8601.');
  }
  if (typeof motivo !== 'string' || motivo.trim() === '') {
    throw new BadRequestException('motivo é obrigatório.');
  }
  return { inicio, fim, motivo };
}

@Controller()
@UseFilters(ProblemaFilter)
export class RecursosController {
  constructor(
    private readonly listarRecursos: ListarRecursos,
    private readonly consultarDisponibilidade: ConsultarDisponibilidade,
    private readonly registrarManutencao: RegistrarManutencao,
  ) {}

  @Get('recursos')
  listar(@Query('categoria') categoria?: string): Promise<Recurso[]> {
    return this.listarRecursos.executar(lerCategoria(categoria));
  }

  @Post('recursos/:recursoId/manutencoes')
  @HttpCode(201)
  async manutencao(
    @Param('recursoId', new ParseUUIDPipe()) recursoId: string,
    @Body() corpo: unknown,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<Manutencao> {
    const manutencao = await this.registrarManutencao.executar(recursoId, lerManutencao(corpo));
    resposta.location(`/v1/recursos/${recursoId}/manutencoes/${manutencao.id}`);
    return manutencao;
  }

  @Get('disponibilidade')
  disponibilidade(
    @Query('data') data?: string,
    @Query('categoria') categoria?: string,
  ): Promise<Disponibilidade[]> {
    if (!ehData(data)) throw new BadRequestException('data é obrigatória, no formato AAAA-MM-DD.');
    return this.consultarDisponibilidade.executar(data, lerCategoria(categoria));
  }
}
