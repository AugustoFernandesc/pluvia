import {
  Controller,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseFilters,
} from '@nestjs/common';

import { ProblemaFilter } from '@app/problema.filter';
import { Sinalizacao } from '@domain/sinalizacao';
import { ReconhecerSinalizacao } from '@use-cases/sinalizacoes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('sinalizacoes')
@UseFilters(ProblemaFilter)
export class SinalizacoesController {
  constructor(private readonly reconhecerSinalizacao: ReconhecerSinalizacao) {}

  /**
   * Comando: modelo de escrita. `X-Request-ID` (do gateway) vira o
   * correlationId do evento. `X-Usuario-Id`, se vier do BFF, vira o
   * reconhecidaPor.
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
