import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type Decimal from 'decimal.js';
import {
  REGISTRO_ESTRATEGIAS,
  type RegistroEstrategias,
} from '../../cotizacion/domain/estrategia-cotizacion.port';
import type { PlanTarifa } from '../../cotizacion/domain/tarifa.types';
import type { ModoPago } from '../../../shared/types/enums';
import { montoTotalPago, validarCuotas } from '../domain/monto-pago';
import { PASARELA_PAGO, type PasarelaPago } from '../domain/pasarela-pago.port';

export interface SolicitudPago {
  ordenId: string;
  primaFinal: Decimal;
  codigoEstrategia: string;
  plan: PlanTarifa;
  modo: ModoPago;
  numeroCuotas?: number;
  maxCuotas: number;
  idempotencyKey: string;
}

export interface ResultadoPago {
  estado: 'APROBADO' | 'RECHAZADO';
  referencia: string;
  montoTotal: Decimal;
  modo: ModoPago;
  numeroCuotas: number | null;
}

/**
 * Cobra una orden (sin endpoint propio: lo usa `compra`, contexto §3.5).
 * Calcula el total con la regla de la aseguradora (RN-38) y llama a la
 * pasarela. No escribe en la base: con el resultado, `compra` llama a
 * confirmar_compra o a registrar_pago_rechazado.
 */
@Injectable()
export class ProcesarPagoService {
  constructor(
    @Inject(PASARELA_PAGO) private readonly pasarela: PasarelaPago,
    @Inject(REGISTRO_ESTRATEGIAS)
    private readonly estrategias: RegistroEstrategias,
  ) {}

  async cobrar(s: SolicitudPago): Promise<ResultadoPago> {
    const error = validarCuotas(s.modo, s.numeroCuotas, s.maxCuotas);
    if (error) throw new BadRequestException(error);

    const montoTotal = montoTotalPago(
      this.estrategias.obtener(s.codigoEstrategia),
      s.primaFinal,
      s.plan,
      s.modo,
    );
    const numeroCuotas = s.modo === 'CUOTAS' ? s.numeroCuotas! : null;

    const r = await this.pasarela.cobrar({
      ordenId: s.ordenId,
      monto: montoTotal,
      modo: s.modo,
      ...(numeroCuotas === null ? {} : { cuotas: numeroCuotas }),
      idempotencyKey: s.idempotencyKey,
    });
    return { ...r, montoTotal, modo: s.modo, numeroCuotas };
  }
}
