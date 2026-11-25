import { Inject, Injectable } from '@nestjs/common';

import {
  FiltroRegioes,
  Pagina,
  REPOSITORIO_REGIOES,
  Regiao,
  RegiaoNaoEncontrada,
  RepositorioRegioes,
} from '@domain/regiao';

@Injectable()
export class ListarRegioes {
  constructor(
    @Inject(REPOSITORIO_REGIOES) private readonly regioes: RepositorioRegioes,
  ) {}

  executar(filtro: FiltroRegioes): Promise<Pagina<Regiao>> {
    return this.regioes.listar(filtro);
  }
}

@Injectable()
export class ObterRegiao {
  constructor(
    @Inject(REPOSITORIO_REGIOES) private readonly regioes: RepositorioRegioes,
  ) {}

  async executar(id: string): Promise<Regiao> {
    const regiao = await this.regioes.obter(id);
    if (!regiao) throw new RegiaoNaoEncontrada(id);
    return regiao;
  }
}
