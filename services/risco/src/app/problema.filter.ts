import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { PanoramaNaoEncontrado } from '@domain/panorama';
import { SinalizacaoNaoEncontrada, TransicaoInvalida } from '@domain/sinalizacao';

const TIPO_BASE = 'https://pluvia.dev/problemas';

/** Converte todo erro numa resposta problem+json (RFC 7807), como no Território. */
@Catch()
export class ProblemaFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemaFilter.name);

  catch(erro: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const requisicao = http.getRequest<Request>();
    const resposta = http.getResponse<Response>();

    const { status, tipo, titulo, detalhe } = this.classificar(erro);
    resposta
      .status(status)
      .type('application/problem+json')
      .json({
        type: `${TIPO_BASE}/${tipo}`,
        title: titulo,
        status,
        detail: detalhe,
        instance: requisicao.originalUrl,
      });
  }

  private classificar(erro: unknown) {
    if (erro instanceof SinalizacaoNaoEncontrada) {
      return { status: 404, tipo: 'nao-encontrado', titulo: 'Sinalização não encontrada', detalhe: erro.message };
    }
    if (erro instanceof PanoramaNaoEncontrado) {
      return { status: 404, tipo: 'nao-encontrado', titulo: 'Panorama não encontrado', detalhe: erro.message };
    }
    if (erro instanceof TransicaoInvalida) {
      return { status: 409, tipo: 'conflito', titulo: 'Transição inválida', detalhe: erro.message };
    }
    if (erro instanceof HttpException) {
      const corpo = erro.getResponse();
      const mensagem =
        typeof corpo === 'object' && corpo !== null && 'message' in corpo
          ? String((corpo as { message: unknown }).message)
          : erro.message;
      const status = erro.getStatus();
      const tipo = status === HttpStatus.BAD_REQUEST ? 'requisicao-invalida' : 'erro-http';
      return { status, tipo, titulo: erro.name, detalhe: mensagem };
    }
    this.logger.error(erro);
    return { status: 500, tipo: 'erro-interno', titulo: 'Erro interno', detalhe: 'Erro inesperado no serviço.' };
  }
}
