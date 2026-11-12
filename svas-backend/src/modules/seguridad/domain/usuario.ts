import type { Rol } from '../../../shared/types/enums';

/** Perfil de negocio (svas.usuario). La contraseña vive en Supabase Auth. */
export interface Usuario {
  id: string;
  email: string;
  rol: Rol;
  nombreCompleto: string;
  activo: boolean;
}

/** Sesión emitida por el proveedor de identidad (Supabase Auth). */
export interface Sesion {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  usuarioId: string;
}

/** Roles que crea el administrador. CLIENTE solo nace del registro en el embudo. */
export const ROLES_INTERNOS = ['ASESOR', 'ADMINISTRADOR'] as const;
export type RolInterno = (typeof ROLES_INTERNOS)[number];

/** svas.usuario.nombre_completo es varchar(160). */
export const MAX_NOMBRE_COMPLETO = 160;

export function armarNombreCompleto(
  nombres: string,
  apellidos: string,
): string {
  return `${nombres} ${apellidos}`.trim().replace(/\s+/g, ' ');
}
