import Decimal from 'decimal.js';

/**
 * Dinero (arquitectura backend §4.7): numeric(12,2) en Postgres, Decimal en
 * TypeScript, string en JSON. Nunca number/float.
 */
export const Dinero = Decimal.clone({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
});
export type Dinero = Decimal;

export function aDinero(valor: Decimal.Value): Decimal {
  const d = new Dinero(valor);
  if (!d.isFinite()) throw new Error(`Monto inválido: ${String(valor)}`);
  return d;
}

/** Redondea a 2 decimales (half-up) para guardar o mostrar. */
export function redondear(valor: Decimal.Value): Decimal {
  return aDinero(valor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Para JSON: siempre string con 2 decimales, p. ej. '1234.50'. */
export function aJson(valor: Decimal.Value): string {
  return redondear(valor).toFixed(2);
}

export function sumar(...valores: Decimal.Value[]): Decimal {
  return valores.reduce<Decimal>(
    (acc, v) => acc.plus(aDinero(v)),
    new Dinero(0),
  );
}
