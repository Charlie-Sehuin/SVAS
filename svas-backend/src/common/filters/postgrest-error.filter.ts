/**
 * Errores de Postgres/PostgREST → HTTP (arquitectura backend §3.4).
 * supabase-js no lanza: devuelve { error }. rpc.helper (y los repositorios)
 * lo convierten en ErrorBaseDatos y HttpExceptionFilter lo traduce aquí.
 * Nunca se filtran nombres de tabla ni SQL: solo los RAISE propios (P0001,
 * P0002, PT409) pasan su mensaje al usuario.
 */
export const MENSAJE_ERROR_INTERNO =
  'Ocurrió un error inesperado. Intenta de nuevo o comunícate con soporte.';

export interface ErrorPostgrest {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

export class ErrorBaseDatos extends Error {
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;

  constructor(error: ErrorPostgrest) {
    super(error.message);
    this.name = 'ErrorBaseDatos';
    this.code = error.code;
    this.details = error.details;
    this.hint = error.hint;
  }
}

export function traducirErrorPostgres(error: ErrorBaseDatos): {
  statusCode: number;
  message: string;
} {
  switch (error.code) {
    case 'P0001': // RAISE EXCEPTION de un RPC: mensaje en español pensado para el usuario
      return { statusCode: 400, message: error.message };
    case 'P0002': // RAISE ... USING ERRCODE = 'P0002' de un RPC: "no existe"
      return { statusCode: 404, message: error.message };
    case 'PT409': // RAISE ... USING ERRCODE = 'PT409' de un RPC: conflicto con mensaje propio
      return { statusCode: 409, message: error.message };
    case '42501': // insufficient_privilege / exigir_rol()
      return {
        statusCode: 403,
        message: 'No tienes permiso para realizar esta acción',
      };
    case '23505': // unique_violation
      return {
        statusCode: 409,
        message: 'La operación ya se realizó o el registro ya existe',
      };
    case '23503': // foreign_key_violation
    case '23514': // check_violation
    case '22P02': // invalid_text_representation (uuid/enum mal formado)
      return { statusCode: 400, message: 'Los datos enviados no son válidos' };
    case 'PGRST116': // .single() sin filas
      return { statusCode: 404, message: 'No encontramos lo que buscas' };
    default:
      return { statusCode: 500, message: MENSAJE_ERROR_INTERNO };
  }
}
