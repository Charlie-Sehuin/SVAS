import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { sha256Hex } from '../../../common/utils/token.util';
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
  /** X-Cotizacion-Token en claro; obligatorio si llega cotizacionId. */
  tokenAcceso?: string;
}

/**
 * Registro mínimo dentro del embudo (doc conexión §2): siempre CLIENTE.
 * Crea la cuenta de Auth y, en una sola transacción, el perfil `usuario`, la
 * ficha `cliente` (con el teléfono) y el vínculo con la cotización anónima.
 * Devuelve el perfil; el frontend inicia sesión después con supabase-js y el
 * token ya trae app_metadata.roles = ['CLIENTE'].
 */
@Injectable()
export class RegistrarClienteUseCase {
  private readonly logger = new Logger(RegistrarClienteUseCase.name);

  constructor(
    @Inject(PROVEEDOR_IDENTIDAD) private readonly identidad: ProveedorIdentidad,
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: UsuarioRepository,
  ) {}

  async ejecutar(d: DatosRegistro): Promise<Usuario> {
    // Antes de crear la cuenta: sin el token no se puede reclamar la cotización.
    if (d.cotizacionId && !d.tokenAcceso) {
      throw new BadRequestException(
        'Para guardar tu cotización en tu cuenta abre el enlace de tu cotización',
      );
    }

    const { id } = await this.identidad
      .crearCuenta(d.email, d.password)
      .catch(traducirErrorIdentidad);

    try {
      return await this.usuarios.registrarCliente({
        id,
        email: d.email,
        nombreCompleto: armarNombreCompleto(d.nombres, d.apellidos),
        contacto: {
          nombres: d.nombres,
          apellidos: d.apellidos,
          telefono: d.telefono,
        },
        cotizacionId: d.cotizacionId,
        tokenHash:
          d.cotizacionId && d.tokenAcceso
            ? sha256Hex(d.tokenAcceso)
            : undefined,
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
