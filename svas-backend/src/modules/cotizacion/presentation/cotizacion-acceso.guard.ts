import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { RequestConContexto } from '../../../common/types/usuario-autenticado';
import { tokenCoincide } from '../../../common/utils/token.util';
import {
  COTIZACION_REPOSITORY,
  type CotizacionRepository,
} from '../domain/cotizacion.repository.port';

export const HEADER_TOKEN_COTIZACION = 'x-cotizacion-token';

/**
 * Backend §4.4 (flujo anónimo seguro). Va con @AuthOpcional() en rutas
 * `/cotizaciones/:id/...`:
 * 1. Con JWT: pasa si la RLS le deja ver la cotización (dueño, asesor del
 *    caso o administrador).
 * 2. Si no, exige X-Cotizacion-Token: sha256(token) debe coincidir con el
 *    guardado (comparación en tiempo constante). El token deja de servir
 *    cuando la cotización pasa a CONVERTIDA.
 * Deja en req.accesoCotizacion por dónde entró.
 */
@Injectable()
export class CotizacionAccesoGuard implements CanActivate {
  constructor(
    @Inject(COTIZACION_REPOSITORY) private readonly repo: CotizacionRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestConContexto>();
    const id = req.params['id'];
    if (typeof id !== 'string' || !isUUID(id)) {
      throw new BadRequestException('La cotización no es válida');
    }

    if (req.usuario && req.accessToken) {
      if (await this.repo.esVisiblePara(req.accessToken, id)) {
        req.accesoCotizacion = 'JWT';
        return true;
      }
    }

    const token = req.headers[HEADER_TOKEN_COTIZACION];
    if (typeof token !== 'string' || !token) {
      if (req.usuario)
        throw new NotFoundException('No encontramos tu cotización');
      throw new UnauthorizedException(
        'Inicia sesión o abre el enlace de tu cotización para continuar',
      );
    }

    const acceso = await this.repo.obtenerAcceso(id);
    if (!acceso || !tokenCoincide(token, acceso.tokenHash)) {
      throw new ForbiddenException('El enlace de tu cotización no es válido');
    }
    if (acceso.estado === 'CONVERTIDA') {
      throw new ForbiddenException(
        'Esta cotización ya se convirtió en póliza: inicia sesión para verla',
      );
    }
    req.accesoCotizacion = 'TOKEN';
    return true;
  }
}
