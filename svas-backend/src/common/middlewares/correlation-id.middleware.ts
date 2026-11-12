import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { RequestConContexto } from '../types/usuario-autenticado';

const FORMATO_VALIDO = /^[\w-]{8,64}$/;

/**
 * Asigna un correlationId a cada request (reutiliza X-Correlation-Id si llega
 * uno válido), lo devuelve en la respuesta y registra una línea al terminar.
 * Se hace en middleware y no en interceptor para registrar también los 401/404
 * que ocurren antes de llegar al controller. Nunca se registra el body.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: RequestConContexto, res: Response, next: NextFunction): void {
    const entrante = req.headers['x-correlation-id'];
    const id =
      typeof entrante === 'string' && FORMATO_VALIDO.test(entrante)
        ? entrante
        : randomUUID();

    req.correlationId = id;
    res.setHeader('X-Correlation-Id', id);

    const inicio = performance.now();
    res.on('finish', () => {
      const ms = Math.round(performance.now() - inicio);
      this.logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms [${id}]`,
      );
    });

    next();
  }
}
