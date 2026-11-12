import type { Rol } from '../../../shared/types/enums';

/** Perfil de negocio (svas.usuario). La contraseña y la sesión las gestiona Supabase Auth. */
export interface Usuario {
  id: string;
  email: string;
  rol: Rol;
  nombreCompleto: string;
  activo: boolean;
}

/** Roles que crea el administrador. CLIENTE solo nace del registro en el embudo. */
export const ROLES_INTERNOS = ['ASESOR', 'ADMINISTRADOR'] as const;
export type RolInterno = (typeof ROLES_INTERNOS)[number];

export function armarNombreCompleto(
  nombres: string,
  apellidos: string,
): string {
  return `${nombres} ${apellidos}`.trim().replace(/\s+/g, ' ');
}
