import type { VariablePerfil } from '../../../shared/types/enums';

/**
 * Puerto 6/6 (opcional) · "Cuéntanos qué te preocupa" (doc contexto §16.6).
 * Traduce texto libre a códigos de escenario y variables de perfil.
 * El texto no se guarda; solo el resultado clasificado (RN-36).
 */
export interface ResultadoClasificacion {
  escenarios: string[]; // códigos de escenario_siniestro, p. ej. 'ROBO_AUTOPARTES'
  variablesPerfil: VariablePerfil[];
}

export interface ClasificadorPreocupaciones {
  clasificar(texto: string): Promise<ResultadoClasificacion>;
}

export const CLASIFICADOR_PREOCUPACIONES = Symbol(
  'CLASIFICADOR_PREOCUPACIONES',
);
