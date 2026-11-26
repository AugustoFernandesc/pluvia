import { Inject, Injectable, Logger } from '@nestjs/common';

import { Envelope } from '@domain/evento';
import {
  REPOSITORIO_PANORAMAS,
  RepositorioPanoramas,
  ResultadoDaProjecao,
  aplicarReconhecimento,
} from '@domain/panorama';

/** Mensagem que nunca vai poder ser processada. Não adianta tentar de novo. */
export class EventoInvalido extends Error {}

export type ResultadoDoProjetor = ResultadoDaProjecao | 'ignorado';

/**
 * Aplica um evento recebido do RabbitMQ no modelo de leitura. Por enquanto o
 * projetor trata o SinalizacaoReconhecida. Os outros eventos da fila
 * risco.projetor são reconhecidos e ignorados.
 */
@Injectable()
export class ProjetarEvento {
  private readonly logger = new Logger(ProjetarEvento.name);

  constructor(
    @Inject(REPOSITORIO_PANORAMAS) private readonly panoramas: RepositorioPanoramas,
  ) {}

  async executar(envelope: Envelope): Promise<ResultadoDoProjetor> {
    switch (envelope.tipo) {
      case 'SinalizacaoReconhecida':
        return this.sinalizacaoReconhecida(envelope);
      default:
        return 'ignorado';
    }
  }

  private async sinalizacaoReconhecida(envelope: Envelope): Promise<ResultadoDoProjetor> {
    const { sinalizacaoId, regiaoId } = envelope.dados as { sinalizacaoId?: unknown; regiaoId?: unknown };
    if (typeof sinalizacaoId !== 'string' || typeof regiaoId !== 'string') {
      throw new EventoInvalido('SinalizacaoReconhecida sem sinalizacaoId ou regiaoId.');
    }

    const { resultado, versao } = await this.panoramas.projetar(envelope, regiaoId, (documento) =>
      aplicarReconhecimento(documento, sinalizacaoId, envelope.ocorridoEm),
    );

    if (resultado === 'aplicado') {
      // Defasagem: do fato (ocorridoEm) até o modelo de leitura refletir.
      const defasagemMs = Date.now() - Date.parse(envelope.ocorridoEm);
      this.logger.log(
        `Panorama ${regiaoId} na versão ${versao}: sinalização ${sinalizacaoId} RECONHECIDA (defasagem ${defasagemMs} ms).`,
      );
    } else if (resultado === 'repetido') {
      this.logger.log(`Evento ${envelope.id} já processado, ignorado.`);
    } else {
      this.logger.warn(`Sem panorama para a região ${regiaoId}, evento ${envelope.id} descartado.`);
    }
    return resultado;
  }
}
