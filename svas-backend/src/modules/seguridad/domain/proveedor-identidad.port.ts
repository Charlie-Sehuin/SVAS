/** Errores del proveedor de identidad, independientes de Supabase. */
export class EmailYaRegistradoError extends Error {}
export class ContrasenaDebilError extends Error {}

/**
 * Puerto hacia el proveedor de identidad (hoy Supabase Auth) para las
 * operaciones que el navegador no puede hacer: crear cuentas (el registro
 * público está desactivado) y bloquearlas. Login, refresh y logout los hace
 * el frontend con supabase-js (doc frontend §9.3).
 */
export interface ProveedorIdentidad {
  /** Crea la cuenta con el email ya confirmado. @throws EmailYaRegistradoError | ContrasenaDebilError */
  crearCuenta(email: string, password: string): Promise<{ id: string }>;
  /** Compensación cuando falla el registro del perfil. */
  eliminarCuenta(id: string): Promise<void>;
  /** Bloqueada: no puede iniciar sesión ni refrescar el token. */
  bloquear(id: string, bloqueada: boolean): Promise<void>;
}

export const PROVEEDOR_IDENTIDAD = Symbol('PROVEEDOR_IDENTIDAD');
