import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type {
  ErrorCampo,
  RequestConContexto,
} from '../types/usuario-autenticado';
import {
  ErrorBaseDatos,
  MENSAJE_ERROR_INTERNO,
  traducirErrorPostgres,
} from './postgrest-error.filter';

interface ErrorResuelto {
  statusCode: number;
  message: string;
  errors?: ErrorCampo[];
}

/**
 * Forma única de error para toda la API (doc conexión §8):
 * { statusCode, message, errors?, correlationId, timestamp, path }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errores');

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<RequestConContexto>();
    const res = ctx.getResponse<Response>();

    const { statusCode, message, errors } = resolverError(excepcion);

    if (statusCode >= 500) {
      const detalle =
        excepcion instanceof ErrorBaseDatos
          ? `[${excepcion.code}] ${excepcion.message} ${excepcion.details ?? ''}`
          : excepcion instanceof Error
            ? excepcion.stack
            : String(excepcion);
      this.logger.error(
        `${req.method} ${req.originalUrl} [${req.correlationId}] → ${statusCode}`,
        detalle,
      );
    }

    res.status(statusCode).json({
      statusCode,
      message,
      ...(errors?.length ? { errors } : {}),
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    });
  }
}

export function resolverError(excepcion: unknown): ErrorResuelto {
  if (excepcion instanceof ErrorBaseDatos)
    return traducirErrorPostgres(excepcion);

  if (excepcion instanceof HttpException) {
    const statusCode = excepcion.getStatus();
    if (statusCode === 500)
      return { statusCode, message: MENSAJE_ERROR_INTERNO };

    const cuerpo = excepcion.getResponse();
    if (typeof cuerpo === 'string') return { statusCode, message: cuerpo };

    const { message, errors } = cuerpo as {
      message?: unknown;
      errors?: unknown;
    };
    return {
      statusCode,
      message: Array.isArray(message)
        ? String(message[0])
        : typeof message === 'string'
          ? message
          : excepcion.message,
      errors: Array.isArray(errors) ? (errors as ErrorCampo[]) : undefined,
    };
  }

  return { statusCode: 500, message: MENSAJE_ERROR_INTERNO };
}
