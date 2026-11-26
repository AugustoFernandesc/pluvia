import { Controller, Get, Param, ParseUUIDPipe, Query, UseFilters } from '@nestjs/common';

import { TAMANHO_MAXIMO, TAMANHO_PADRAO, inteiro } from '@app/parametros';
import { ProblemaFilter } from '@app/problema.filter';
import { PanoramaCompleto, ResumoPanorama } from '@domain/panorama';
import { Pagina } from '@domain/sinalizacao';
import { ListarPanoramas, ObterPanorama } from '@use-cases/panoramas';

/** Consultas: tudo aqui lê do banco de LEITURA (risco-leitura-db). */
@Controller('panoramas')
@UseFilters(ProblemaFilter)
export class PanoramasController {
  constructor(
    private readonly listarPanoramas: ListarPanoramas,
    private readonly obterPanorama: ObterPanorama,
  ) {}

  @Get()
  listar(
    @Query('municipio') municipio?: string,
    @Query('pagina') pagina?: string,
    @Query('tamanho') tamanho?: string,
  ): Promise<Pagina<ResumoPanorama>> {
    return this.listarPanoramas.executar({
      municipio,
      pagina: inteiro(pagina, 'pagina', 1),
      tamanho: inteiro(tamanho, 'tamanho', TAMANHO_PADRAO, TAMANHO_MAXIMO),
    });
  }

  @Get(':regiaoId')
  obter(@Param('regiaoId', new ParseUUIDPipe()) regiaoId: string): Promise<PanoramaCompleto> {
    return this.obterPanorama.executar(regiaoId);
  }
}
