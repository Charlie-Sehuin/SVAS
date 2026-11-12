import type { Sesion } from './usuario';

/** Errores del proveedor de identidad, independientes de Supabase. */
export class CredencialesInvalidasError extends Error {}
export class CuentaBloqueadaError extends Error {}
export class SesionInvalidaError extends Error {}
export class EmailYaRegistradoError extends Error {}
export class ContrasenaDebilError extends Error {}

/**
 * Puerto hacia el proveedor de identidad (hoy Supabase Auth). Gestiona
 * cuentas y contraseñas; el perfil de negocio lo gestiona UsuarioRepository.
 */
export interface ProveedorIdentidad {
  /** @throws CredencialesInvalidasError | CuentaBloqueadaError */
  iniciarSesion(email: string, password: string): Promise<Sesion>;
  /** @throws SesionInvalidaError (incluye cuentas bloqueadas) */
  refrescar(refreshToken: string): Promise<Sesion>;
  /** Crea la cuenta con el email ya confirmado. @throws EmailYaRegistradoError | ContrasenaDebilError */
  crearCuenta(email: string, password: string): Promise<{ id: string }>;
  /** Compensación cuando falla el registro del perfil. */
  eliminarCuenta(id: string): Promise<void>;
  /** Bloqueada: no puede iniciar sesión ni refrescar el token. */
  bloquear(id: string, bloqueada: boolean): Promise<void>;
}

export const PROVEEDOR_IDENTIDAD = Symbol('PROVEEDOR_IDENTIDAD');
