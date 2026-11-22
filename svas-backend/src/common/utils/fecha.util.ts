/** Las fechas de negocio (vencimientos) se miden en la hora de Lima, no en la del servidor. */
const ZONA = 'America/Lima';
const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Hoy en Lima como `YYYY-MM-DD`. */
export const hoyEnLima = (ahora: Date = new Date()): string =>
  formatoDia.format(ahora);

const MS_DIA = 86_400_000;

/**
 * Días de calendario desde `hoy` hasta `fecha` (ambas `YYYY-MM-DD`): 0 = vence hoy, 3 = en tres días,
 * -2 = venció hace dos días.
 */
export function diasHasta(fecha: string, hoy: string = hoyEnLima()): number {
  return Math.round(
    (Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) /
      MS_DIA,
  );
}
