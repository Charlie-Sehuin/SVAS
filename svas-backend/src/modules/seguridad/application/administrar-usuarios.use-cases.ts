import { Inject, Injectable, Logger } from '@nestjs/common';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { generarContrasenaLegible } from '../../../common/utils/contrasena.util';
import {
  PROVEEDOR_IDENTIDAD,
  type ProveedorIdentidad,
} from '../domain/proveedor-identidad.port';
import type { RolInterno, Usuario } from '../domain/usuario';
import {
  type FiltrosUsuarios,
  type PaginaUsuarios,
  USUARIO_REPOSITORY,
  type UsuarioRepository,
} from '../domain/usuario.repository.port';
import { traducirErrorIdentidad } from './errores-identidad';

/** Casos de uso del ADMINISTRADOR sobre usuarios (RF-31, RF-32). */

@Injectable()
export class ListarUsuariosUseCase {
  constructor(
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: UsuarioRepository,
  ) {}

  ejecutar(
    accessToken: string,
    filtros: FiltrosUsuarios,
  ): Promise<PaginaUsuarios> {
    return this.usuarios.listar(accessToken, filtros);
  }
}

@Injectable()
export class CrearUsuarioInternoUseCase {
  private readonly logger = new Logger(CrearUsuarioInternoUseCase.name);

  constructor(
    @Inject(PROVEEDOR_IDENTIDAD) private readonly identidad: ProveedorIdentidad,
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: UsuarioRepository,
  ) {}

  /**
   * Crea la cuenta con una contraseña temporal que se devuelve UNA sola vez
   * (no hay SMTP propio para invitaciones). El usuario la cambia al entrar.
   */
  async ejecutar(
    accessToken: string,
    d: { email: string; nombreCompleto: string; rol: RolInterno },
  ): Promise<{ usuario: Usuario; contrasenaTemporal: string }> {
    const contrasenaTemporal = generarContrasenaLegible(); // p. ej. Luna-Roble-Mango-Faro-47
    const { id } = await this.identidad
      .crearCuenta(d.email, contrasenaTemporal)
      .catch(traducirErrorIdentidad);

    try {
      // El RPC vuelve a exigir ADMINISTRADOR con auth.uid() y deja la bitácora.
      const usuario = await this.usuarios.registrarInterno(accessToken, {
        id,
        ...d,
      });
      return { usuario, contrasenaTemporal };
    } catch (error) {
      await this.identidad
        .eliminarCuenta(id)
        .catch((e: unknown) =>
          this.logger.error(`No se pudo revertir la cuenta ${id}`, String(e)),
        );
      throw error;
    }
  }
}

@Injectable()
export class CambiarRolUsuarioUseCase {
  constructor(
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: UsuarioRepository,
    private readonly rolesGuard: RolesGuard,
  ) {}

  async ejecutar(
    accessToken: string,
    id: string,
    rol: RolInterno,
  ): Promise<Usuario> {
    const usuario = await this.usuarios.cambiarRol(accessToken, id, rol);
    this.rolesGuard.invalidar(id); // el nuevo rol rige en la siguiente request
    return usuario;
  }
}

@Injectable()
export class CambiarEstadoUsuarioUseCase {
  private readonly logger = new Logger(CambiarEstadoUsuarioUseCase.name);

  constructor(
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: UsuarioRepository,
    @Inject(PROVEEDOR_IDENTIDAD) private readonly identidad: ProveedorIdentidad,
    private readonly rolesGuard: RolesGuard,
  ) {}

  async ejecutar(
    accessToken: string,
    id: string,
    activo: boolean,
  ): Promise<Usuario> {
    const usuario = await this.usuarios.cambiarEstado(accessToken, id, activo);
    this.rolesGuard.invalidar(id);

    // Además del corte inmediato del RolesGuard, se bloquea en Supabase Auth
    // para que no pueda iniciar sesión ni refrescar el token.
    await this.identidad
      .bloquear(id, !activo)
      .catch((e: unknown) =>
        this.logger.warn(
          `Usuario ${id} ${activo ? 'activado' : 'desactivado'} en svas, pero falló el bloqueo en Auth: ${String(e)}`,
        ),
      );
    return usuario;
  }
}
