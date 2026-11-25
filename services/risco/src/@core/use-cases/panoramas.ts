import { Inject, Injectable } from '@nestjs/common';

import {
  FiltroPanoramas,
  PanoramaCompleto,
  PanoramaNaoEncontrado,
  REPOSITORIO_PANORAMAS,
  RepositorioPanoramas,
  ResumoPanorama,
  detalhar,
  resumir,
} from '@domain/panorama';
import { Pagina } from '@domain/sinalizacao';

/** Consulta: modelo de leitura, ordenado do nível mais grave para o mais leve. */
@Injectable()
export class ListarPanoramas {
  constructor(
    @Inject(REPOSITORIO_PANORAMAS) private readonly panoramas: RepositorioPanoramas,
  ) {}

  async executar(filtro: FiltroPanoramas): Promise<Pagina<ResumoPanorama>> {
    const pagina = await this.panoramas.listar(filtro);
    return { ...pagina, itens: pagina.itens.map(resumir) };
  }
}

/** Consulta: o documento pronto de uma região, do modelo de leitura. */
@Injectable()
export class ObterPanorama {
  constructor(
    @Inject(REPOSITORIO_PANORAMAS) private readonly panoramas: RepositorioPanoramas,
  ) {}

  async executar(regiaoId: string): Promise<PanoramaCompleto> {
    const panorama = await this.panoramas.obter(regiaoId);
    if (!panorama) throw new PanoramaNaoEncontrado(regiaoId);
    return detalhar(panorama);
  }
}
