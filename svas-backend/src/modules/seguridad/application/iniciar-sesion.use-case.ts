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

@Injectable()
export class IniciarSesionUseCase {
  constructor(
    @Inject(PROVEEDOR_IDENTIDAD) private readonly identidad: ProveedorIdentidad,
    private readonly sesiones: SesionAutorizadaService,
  ) {}

  async ejecutar(email: string, password: string): Promise<RespuestaSesion> {
    const sesion = await this.identidad
      .iniciarSesion(email, password)
      .catch(traducirErrorIdentidad);
    return this.sesiones.autorizar(sesion);
  }
}
