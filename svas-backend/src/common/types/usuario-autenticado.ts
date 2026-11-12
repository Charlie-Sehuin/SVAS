import type { Request } from 'express';

export const ROLES = ['CLIENTE', 'ASESOR', 'ADMINISTRADOR'] as const;
export type Rol = (typeof ROLES)[number];

export function esRol(valor: unknown): valor is Rol {
  return (
    typeof valor === 'string' && (ROLES as readonly string[]).includes(valor)
  );
}

/** Lo que SupabaseAuthGuard adjunta a la request tras verificar el JWT. */
export interface UsuarioAutenticado {
  id: string;
  email: string | null;
  /** Desde app_metadata.roles (firmado). RolesGuard lo confirma contra svas.usuario. */
  roles: Rol[];
}

export interface RequestConContexto extends Request {
  usuario?: UsuarioAutenticado;
  /** JWT ya verificado; para crear el cliente de usuario (RLS + auth.uid()). Nunca se devuelve. */
  accessToken?: string;
  correlationId?: string;
}

/** Error de un campo del formulario (doc conexión §8). */
export interface ErrorCampo {
  campo: string;
  mensaje: string;
}
