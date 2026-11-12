import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PROVEEDOR_IDENTIDAD,
  type ProveedorIdentidad,
} from '../domain/proveedor-identidad.port';
import { armarNombreCompleto, type Usuario } from '../domain/usuario';
import {
  USUARIO_REPOSITORY,
  type UsuarioRepository,
} from '../domain/usuario.repository.port';
import { traducirErrorIdentidad } from './errores-identidad';

export interface DatosRegistro {
  nombres: string;
  apellidos: string;
  email: string;
  password: string;
  telefono: string;
  cotizacionId?: string;
}

/**
 * Registro mínimo dentro del embudo (doc conexión §2): siempre CLIENTE.
 * Devuelve el perfil; el frontend inicia sesión después con supabase-js y el
 * token ya trae app_metadata.roles = ['CLIENTE'].
 * PENDIENTE (Ola 1, migraciones 0007/0008): crear la fila de `cliente` con
 * el teléfono y vincular `cotizacionId` si llega con X-Cotizacion-Token.
 */
@Injectable()
export class RegistrarClienteUseCase {
  private readonly logger = new Logger(RegistrarClienteUseCase.name);

  constructor(
    @Inject(PROVEEDOR_IDENTIDAD) private readonly identidad: ProveedorIdentidad,
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: UsuarioRepository,
  ) {}

  async ejecutar(d: DatosRegistro): Promise<Usuario> {
    const { id } = await this.identidad
      .crearCuenta(d.email, d.password)
      .catch(traducirErrorIdentidad);

    try {
      return await this.usuarios.registrarCliente({
        id,
        email: d.email,
        nombreCompleto: armarNombreCompleto(d.nombres, d.apellidos),
      });
    } catch (error) {
      // Compensación: no dejar una cuenta de Auth sin perfil de negocio.
      await this.identidad
        .eliminarCuenta(id)
        .catch((e: unknown) =>
          this.logger.error(`No se pudo revertir la cuenta ${id}`, String(e)),
        );
      throw error;
    }
  }
}
