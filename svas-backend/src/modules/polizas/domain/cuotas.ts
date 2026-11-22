import type Decimal from 'decimal.js';
import { diasHasta, hoyEnLima } from '../../../common/utils/fecha.util';
import { aJson, sumar } from '../../../common/utils/money.util';
import type { EstadoPago } from '../../../shared/types/enums';

/**
 * Una cuota tal como la ve el cliente en "Mi cuenta" (`GET /polizas/mias` y la respuesta de pagar cuotas).
 *
 * Solo las PENDIENTES traen los dos datos de ayuda, calculados aquí para que el navegador no calcule dinero ni fechas:
 *  - `diasParaVencer`: días de calendario en Lima; 0 = vence hoy, negativo = ya venció.
 *  - `montoAcumulado`: lo que cuesta pagar hasta esta cuota inclusive, sumando las pendientes en orden. Es el monto de
 *    "pagar las N siguientes" cuando esta es la N-ésima pendiente.
 */
export interface CuotaResumen {
  numero: number;
  monto: string;
  fechaVencimiento: string;
  estado: EstadoPago;
  diasParaVencer: number | null;
  montoAcumulado: string | null;
}

export function aCuotasResumen(
  cuotas: {
    numero: number;
    monto: Decimal.Value;
    fechaVencimiento: string;
    estado: EstadoPago;
  }[],
  hoy: string = hoyEnLima(),
): CuotaResumen[] {
  let acumulado = sumar(0);
  return [...cuotas]
    .sort((a, b) => a.numero - b.numero)
    .map((c) => {
      const pendiente = c.estado === 'PENDIENTE';
      if (pendiente) acumulado = acumulado.plus(sumar(c.monto));
      return {
        numero: c.numero,
        monto: aJson(c.monto),
        fechaVencimiento: c.fechaVencimiento,
        estado: c.estado,
        diasParaVencer: pendiente ? diasHasta(c.fechaVencimiento, hoy) : null,
        montoAcumulado: pendiente ? aJson(acumulado) : null,
      };
    });
}
