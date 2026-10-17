import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

import {
  CatalogoIndisponivelError,
  ConflitoError,
  CredenciaisInvalidasError,
  RecursoNaoEncontradoError,
} from '../../application/errors';
import { DomainError } from '../../domain/shared/DomainError';

interface ErroComCode {
  code: string;
  message: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof DomainError) {
      this.responderComCode(response, 422, 'Unprocessable Entity', exception);
      return;
    }

    if (exception instanceof RecursoNaoEncontradoError) {
      this.responderComCode(response, 404, 'Not Found', exception);
      return;
    }

    if (exception instanceof ConflitoError) {
      this.responderComCode(response, 409, 'Conflict', exception);
      return;
    }

    if (exception instanceof CredenciaisInvalidasError) {
      this.responderComCode(response, 401, 'Unauthorized', exception);
      return;
    }

    if (exception instanceof CatalogoIndisponivelError) {
      this.responderComCode(response, 503, 'Service Unavailable', exception);
      return;
    }

    // Corrida que passou pela checagem prévia e bateu no índice único: 409 sem vazar tabela/coluna.
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      this.responderComCode(response, 409, 'Conflict', { code: 'REGISTRO_DUPLICADO', message: 'Registro já existe' });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
      return;
    }

    this.logger.error('Erro não tratado', exception as Error);
    response.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Erro interno do servidor',
    });
  }

  private responderComCode(response: Response, statusCode: number, error: string, exception: ErroComCode): void {
    response.status(statusCode).json({ statusCode, error, code: exception.code, message: exception.message });
  }
}
