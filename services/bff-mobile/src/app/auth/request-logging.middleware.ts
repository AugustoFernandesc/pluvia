import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpRequest');

  use(request: Request, response: Response, next: NextFunction): void {
    const recebido = request.header('x-request-id');
    const requestId =
      recebido && /^[0-9a-f-]{36}$/i.test(recebido) ? recebido : randomUUID();
    const inicio = Date.now();
    response.setHeader('X-Request-ID', requestId);
    response.once('finish', () => {
      this.logger.log(
        JSON.stringify({
          requestId,
          method: request.method,
          path: request.path,
          status: response.statusCode,
          durationMs: Date.now() - inicio,
        }),
      );
    });
    next();
  }
}
