import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { RequestConContexto } from '../types/usuario-autenticado';

const CLAVES_SECRETAS = /(_hash|Hash)$|^(enlace_token|enlaceToken)$/;
const CLAVES_DESGLOSE = /^(detalle_calculo|detalleCalculo)$/;

/**
 * Última barrera (arquitectura backend §3.4): aunque un DTO se equivoque,
 * nunca salen hashes ni el token del enlace de retoma, y el desglose de la
 * prima (RN-41) solo llega a ASESOR y ADMINISTRADOR.
 */
@Injectable()
export class SanitizeResponseInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const roles =
      ctx.switchToHttp().getRequest<RequestConContexto>().usuario?.roles ?? [];
    const verDesglose =
      roles.includes('ASESOR') || roles.includes('ADMINISTRADOR');
    return next.handle().pipe(map((datos) => sanitizar(datos, verDesglose)));
  }
}

export function sanitizar(valor: unknown, verDesglose: boolean): unknown {
  if (Array.isArray(valor)) return valor.map((v) => sanitizar(v, verDesglose));
  if (!esObjetoPlano(valor)) return valor;

  const limpio: Record<string, unknown> = {};
  for (const [clave, v] of Object.entries(valor)) {
    if (CLAVES_SECRETAS.test(clave)) continue;
    if (!verDesglose && CLAVES_DESGLOSE.test(clave)) continue;
    limpio[clave] = sanitizar(v, verDesglose);
  }
  return limpio;
}

/** Solo objetos literales/JSON: se respetan Date, Decimal, Buffer, etc. */
function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v) as object | null;
  return proto === Object.prototype || proto === null;
}
