import type Decimal from 'decimal.js';
import { redondear } from '../../../common/utils/money.util';
import type { EstrategiaCotizacion } from '../../cotizacion/domain/estrategia-cotizacion.port';
import type { PlanTarifa } from '../../cotizacion/domain/tarifa.types';
import type { ModoPago } from '../../../shared/types/enums';

export const MINIMO_CUOTAS = 2;

/**
 * Total a cobrar (RN-38). Al contado es la prima final; en cuotas lo decide la
 * aseguradora (La Positiva suma su recargo por fraccionar). El descuento ya
 * está dentro de primaFinal: se aplica antes de fraccionar.
 */
export function montoTotalPago(
  estrategia: Pick<EstrategiaCotizacion, 'totalEnCuotas'>,
  primaFinal: Decimal,
  plan: PlanTarifa,
  modo: ModoPago,
): Decimal {
  return modo === 'UNICO'
    ? redondear(primaFinal)
    : redondear(estrategia.totalEnCuotas(primaFinal, plan));
}

/** Mensaje de error si el número de cuotas no vale para el modo; null si está bien. */
export function validarCuotas(
  modo: ModoPago,
  numeroCuotas: number | undefined,
  maxCuotas: number,
): string | null {
  if (modo === 'UNICO') {
    return numeroCuotas === undefined
      ? null
      : 'El pago al contado no lleva número de cuotas';
  }
  if (numeroCuotas === undefined)
    return 'Indica en cuántas cuotas quieres pagar';
  if (
    !Number.isInteger(numeroCuotas) ||
    numeroCuotas < MINIMO_CUOTAS ||
    numeroCuotas > maxCuotas
  ) {
    return `Puedes pagar de ${MINIMO_CUOTAS} a ${maxCuotas} cuotas`;
  }
  return null;
}
