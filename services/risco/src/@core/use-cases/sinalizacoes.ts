import { Inject, Injectable } from '@nestjs/common';

import { criarEnvelope } from '@domain/evento';
import {
  FiltroSinalizacoes,
  Pagina,
  REPOSITORIO_SINALIZACOES,
  RepositorioSinalizacoes,
  Sinalizacao,
  SinalizacaoNaoEncontrada,
  reconhecer,
} from '@domain/sinalizacao';

export const ROTA_SINALIZACAO_RECONHECIDA = 'risco.sinalizacao.reconhecida';

export interface ComandoReconhecer {
  sinalizacaoId: string;
  reconhecidaPor: string | null;
  correlationId?: string;
}

/**
 * Comando do modelo de escrita. Muda o estado e grava o evento
 * SinalizacaoReconhecida na outbox, na mesma transação. Quem publica no
 * RabbitMQ é o PublicadorOutbox, depois.
 */
@Injectable()
export class ReconhecerSinalizacao {
  constructor(
    @Inject(REPOSITORIO_SINALIZACOES)
    private readonly sinalizacoes: RepositorioSinalizacoes,
  ) {}

  async executar(comando: ComandoReconhecer): Promise<Sinalizacao> {
    const resultado = await this.sinalizacoes.alterar(comando.sinalizacaoId, (atual) => {
      const agora = new Date();
      const sinalizacao = reconhecer(atual, agora, comando.reconhecidaPor);
      const envelope = criarEnvelope(
        'SinalizacaoReconhecida',
        {
          sinalizacaoId: sinalizacao.id,
          regiaoId: sinalizacao.regiaoId,
          reconhecidaPor: sinalizacao.reconhecidaPor,
        },
        agora,
        comando.correlationId,
      );
      return { sinalizacao, eventos: [{ routingKey: ROTA_SINALIZACAO_RECONHECIDA, envelope }] };
    });
    if (!resultado) throw new SinalizacaoNaoEncontrada(comando.sinalizacaoId);
    return resultado;
  }
}

/**
 * Consultas de sinalizações. Leem do modelo de ESCRITA, e não do de leitura,
 * porque o técnico que acabou de reconhecer precisa ver o estado novo na
 * hora, sem esperar a projeção (07-cqrs.md).
 */
@Injectable()
export class ListarSinalizacoes {
  constructor(
    @Inject(REPOSITORIO_SINALIZACOES)
    private readonly sinalizacoes: RepositorioSinalizacoes,
  ) {}

  executar(filtro: FiltroSinalizacoes): Promise<Pagina<Sinalizacao>> {
    return this.sinalizacoes.listar(filtro);
  }
}

@Injectable()
export class ObterSinalizacao {
  constructor(
    @Inject(REPOSITORIO_SINALIZACOES)
    private readonly sinalizacoes: RepositorioSinalizacoes,
  ) {}

  async executar(id: string): Promise<Sinalizacao> {
    const sinalizacao = await this.sinalizacoes.obter(id);
    if (!sinalizacao) throw new SinalizacaoNaoEncontrada(id);
    return sinalizacao;
  }
}
