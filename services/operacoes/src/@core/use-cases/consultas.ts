import { Inject, Injectable } from '@nestjs/common';

import { Acao, AcaoNaoEncontrada } from '@domain/acao';
import { FiltroAcoes, REPOSITORIO_ACOES, RepositorioAcoes } from '@domain/portas';
import { PassoSaga, Saga } from '@domain/saga';

@Injectable()
export class ListarAcoes {
  constructor(@Inject(REPOSITORIO_ACOES) private readonly acoes: RepositorioAcoes) {}

  executar(filtro: FiltroAcoes): Promise<{ itens: Acao[]; total: number }> {
    return this.acoes.listar(filtro);
  }
}

@Injectable()
export class ObterAcao {
  constructor(@Inject(REPOSITORIO_ACOES) private readonly acoes: RepositorioAcoes) {}

  async executar(id: string): Promise<Acao> {
    const acao = await this.acoes.obter(id);
    if (!acao) throw new AcaoNaoEncontrada(id);
    return acao;
  }
}

@Injectable()
export class ObterSaga {
  constructor(@Inject(REPOSITORIO_ACOES) private readonly acoes: RepositorioAcoes) {}

  async executar(acaoId: string): Promise<{ saga: Saga; passos: PassoSaga[] }> {
    const resultado = await this.acoes.sagaDaAcao(acaoId);
    if (!resultado) throw new AcaoNaoEncontrada(acaoId);
    return resultado;
  }
}
