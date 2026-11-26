import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

const TIPO_BASE = 'https://pluvia.dev/problemas';

/** Converts every error into an RFC 7807 problem+json response. */
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
