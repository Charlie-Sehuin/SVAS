import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import {
  catchError,
  type Observable,
  throwError,
  timeout,
  TimeoutError,
} from 'rxjs';

export const TIMEOUT_MS = 15_000;

/** Corta las requests que pasan de 15 s para no dejar conexiones colgadas. */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(TIMEOUT_MS),
      catchError((err: unknown) =>
        throwError(() =>
          err instanceof TimeoutError
            ? new RequestTimeoutException(
                'La operación tardó demasiado. Intenta de nuevo.',
              )
            : err,
        ),
      ),
    );
  }
}
