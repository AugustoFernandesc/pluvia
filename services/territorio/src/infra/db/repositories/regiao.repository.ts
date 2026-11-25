import { Injectable } from '@nestjs/common';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';

import {
  FiltroRegioes,
  Pagina,
  Regiao,
  RepositorioRegioes,
} from '@domain/regiao';

import { RegiaoSchema } from './regiao.schema';

@Injectable()
export class RepositorioRegioesTypeorm implements RepositorioRegioes {
  private readonly repositorio: Repository<Regiao>;

  constructor(dataSource: DataSource) {
    this.repositorio = dataSource.getRepository(RegiaoSchema);
  }

  async listar(filtro: FiltroRegioes): Promise<Pagina<Regiao>> {
    const where: FindOptionsWhere<Regiao> = {};
    if (filtro.municipio) where.municipio = filtro.municipio;
    if (filtro.uf) where.uf = filtro.uf.toUpperCase();

    const [itens, total] = await this.repositorio.findAndCount({
      where,
      order: { nome: 'ASC' },
      skip: (filtro.pagina - 1) * filtro.tamanho,
      take: filtro.tamanho,
    });
    return { itens, pagina: filtro.pagina, tamanho: filtro.tamanho, total };
  }

  obter(id: string): Promise<Regiao | null> {
    return this.repositorio.findOneBy({ id });
  }
}
