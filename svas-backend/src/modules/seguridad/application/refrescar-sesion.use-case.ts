import { Inject, Injectable } from '@nestjs/common';
import {
  PROVEEDOR_IDENTIDAD,
  type ProveedorIdentidad,
} from '../domain/proveedor-identidad.port';
import {
  type RespuestaSesion,
  SesionAutorizadaService,
  traducirErrorIdentidad,
} from './sesion-autorizada.service';

/** El token nuevo trae los roles actuales (app_metadata se lee al emitirlo). */
@Injectable()
export class RefrescarSesionUseCase {
  constructor(
    @Inject(PROVEEDOR_IDENTIDAD) private readonly identidad: ProveedorIdentidad,
    private readonly sesiones: SesionAutorizadaService,
  ) {}

  async ejecutar(refreshToken: string): Promise<RespuestaSesion> {
    const sesion = await this.identidad
      .refrescar(refreshToken)
      .catch(traducirErrorIdentidad);
    return this.sesiones.autorizar(sesion);
  }
}
