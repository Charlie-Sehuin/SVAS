/**
 * Reportes (contexto §3.9, §10, §16.7). Los agrega la base (0036); este
 * dominio solo fija el periodo y las agrupaciones permitidas.
 */

export const AGRUPAR_VENTAS = ['canal', 'aseguradora', 'plan'] as const;
export type AgruparVentas = (typeof AGRUPAR_VENTAS)[number];

/** Días de Lima, ambos extremos incluidos (YYYY-MM-DD). */
export interface Periodo {
  desde: string;
  hasta: string;
}

export const MAXIMO_DIAS_PERIODO = 366;
export const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const ZONA = 'America/Lima';

/** YYYY-MM-DD de un instante en Lima. */
export function fechaLima(instante: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

const esFechaReal = (f: string) => {
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
};

const dias = (desde: string, hasta: string) =>
  (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) /
  86_400_000;

/**
 * Sin fechas: el mes en curso hasta hoy. Con una sola: el otro extremo es
 * el inicio del mes de "hasta" o el día de hoy. Devuelve el periodo o el
 * mensaje de error (la base vuelve a validar).
 */
export function resolverPeriodo(
  q: { desde?: string; hasta?: string },
  hoy: Date = new Date(),
): Periodo | string {
  const hasta = q.hasta ?? fechaLima(hoy);
  const desde = q.desde ?? `${hasta.slice(0, 8)}01`;
  if (!esFechaReal(desde) || !esFechaReal(hasta)) {
    return 'Las fechas deben tener el formato AAAA-MM-DD';
  }
  if (desde > hasta) {
    return 'La fecha "desde" no puede ser posterior a "hasta"';
  }
  if (dias(desde, hasta) > MAXIMO_DIAS_PERIODO) {
    return 'El periodo no puede superar un año';
  }
  return { desde, hasta };
}
