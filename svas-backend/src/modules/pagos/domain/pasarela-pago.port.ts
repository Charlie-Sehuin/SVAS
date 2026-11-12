import type Decimal from 'decimal.js';
import type { ModoPago } from '../../../shared/types/enums';

/** Puerto 2/6 · Cobro (arquitectura backend §4.5). Hoy simulado; mañana una pasarela real. */
export interface PasarelaPago {
  cobrar(i: {
    ordenId: string;
    monto: Decimal;
    modo: ModoPago;
    cuotas?: number;
    idempotencyKey: string;
  }): Promise<{ estado: 'APROBADO' | 'RECHAZADO'; referencia: string }>;
}

export const PASARELA_PAGO = Symbol('PASARELA_PAGO');
