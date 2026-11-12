import type { Rol } from '../../../shared/types/enums';
import type { RolInterno, Usuario } from './usuario';

export interface FiltrosUsuarios {
  rol?: Rol;
  activo?: boolean;
  busqueda?: string;
  pagina: number;
  tamano: number;
}

export interface PaginaUsuarios {
  items: Usuario[];
  total: number;
  pagina: number;
  tamano: number;
}

/**
 * Perfil de negocio en svas.usuario. Los métodos que reciben `accessToken`
 * se ejecutan como ese usuario (RLS + RPC con exigir_rol); los demás, como
 * sistema (service_role).
 */
export interface UsuarioRepository {
  buscarPorId(id: string): Promise<Usuario | null>;
  /**
   * Perfil CLIENTE + ficha `cliente` (+ cotización anónima con su token) en
   * una sola transacción (RPC registrar_usuario_cliente).
   */
  registrarCliente(u: {
    id: string;
    email: string;
    nombreCompleto: string;
    contacto: { nombres: string; apellidos: string; telefono: string };
    cotizacionId?: string;
    tokenHash?: string;
  }): Promise<Usuario>;

  listar(
    accessToken: string,
    filtros: FiltrosUsuarios,
  ): Promise<PaginaUsuarios>;
  registrarInterno(
    accessToken: string,
    u: { id: string; email: string; nombreCompleto: string; rol: RolInterno },
  ): Promise<Usuario>;
  cambiarRol(
    accessToken: string,
    id: string,
    rol: RolInterno,
  ): Promise<Usuario>;
  cambiarEstado(
    accessToken: string,
    id: string,
    activo: boolean,
  ): Promise<Usuario>;
}

export const USUARIO_REPOSITORY = Symbol('USUARIO_REPOSITORY');
