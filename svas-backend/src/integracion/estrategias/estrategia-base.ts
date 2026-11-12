import Decimal from 'decimal.js';
import { z } from 'zod';
import { redondear } from '../../common/utils/money.util';
import type {
  CodigoEstrategia,
  EstrategiaCotizacion,
} from '../../modules/cotizacion/domain/estrategia-cotizacion.port';
import { SumaFueraDeRangoException } from '../../modules/cotizacion/domain/suma-fuera-de-rango.exception';
import type {
  PesoNombre,
  PlanTarifa,
  ResultadoPlan,
  TarifaAseguradora,
  VehiculoCotizable,
} from '../../modules/cotizacion/domain/tarifa.types';

export type Pesos = Record<PesoNombre, Decimal>;

/**
 * Pasos comunes a las 5 aseguradoras (arquitectura backend §3.6.1): rango,
 * suma, pesos, redondeo, cuota mensual y desglose. Cada subclase solo define
 * su fórmula en primaAnual() (RN-40). Funciones puras: sin I/O.
 */
export abstract class EstrategiaBase implements EstrategiaCotizacion {
  abstract readonly codigo: CodigoEstrategia;
  readonly parametrosSchema: z.ZodType = z.object({}).strict();
  readonly pesosRequeridos: readonly PesoNombre[] = ['marca', 'modelo', 'anio'];
  readonly pesosOpcionales: readonly PesoNombre[] = [];

  /** LO ÚNICO QUE CAMBIA ENTRE ASEGURADORAS: la prima anual (sin redondear) de un plan. */
  protected abstract primaAnual(c: {
    S: Decimal;
    plan: PlanTarifa;
    w: Pesos;
  }): { prima: Decimal; paso: Record<string, unknown> };

  // async: hoy la fórmula es síncrona, pero el día que una aseguradora tenga
  // API real (RNF-15) solo cambia su clase; además un throw llega como rechazo.
  async cotizar(
    v: VehiculoCotizable,
    tarifa: TarifaAseguradora,
    suma?: Decimal,
  ): Promise<ResultadoPlan[]> {
    return this.calcular(v, tarifa, suma);
  }

  /** Por defecto sin recargo: el total en cuotas es la misma prima. La Positiva lo sobrescribe. */
  totalEnCuotas(primaFinal: Decimal, _plan: PlanTarifa): Decimal {
    return primaFinal;
  }

  private calcular(
    v: VehiculoCotizable,
    tarifa: TarifaAseguradora,
    suma?: Decimal,
  ): ResultadoPlan[] {
    const rango = tarifa.rangos.get(`${v.modeloId}:${v.anio}`);
    if (!rango) return noDisponibles(tarifa, 'SIN_RANGO'); // RN-39

    const S = suma ?? sumaInicial(rango);
    if (S.lt(rango.minima) || S.gt(rango.maxima)) {
      throw new SumaFueraDeRangoException(rango.minima, rango.maxima); // RN-37
    }

    const pesos = this.resolverPesos(v, tarifa);
    if (!pesos) return noDisponibles(tarifa, 'PESO_FALTANTE'); // RN-39

    return tarifa.planes.map((plan) => {
      const { prima, paso } = this.primaAnual({ S, plan, w: pesos.w });
      const anual = redondear(prima);
      const totalCuotas = redondear(this.totalEnCuotas(anual, plan));
      return {
        planId: plan.planId,
        disponible: true,
        sumaAsegurada: S,
        prima: anual,
        primaMensual: redondear(totalCuotas.div(12)),
        detalleCalculo: {
          // RN-41: instantánea para explicar la prima después
          estrategia: this.codigo,
          sumaAsegurada: S.toFixed(2),
          rango: {
            minima: rango.minima.toFixed(2),
            maxima: rango.maxima.toFixed(2),
          },
          tasaBase: plan.tasaBase.toFixed(4),
          parametros: plan.parametros,
          pesos: Object.fromEntries(
            Object.entries(pesos.w).map(([k, d]) => [k, d.toFixed(3)]),
          ),
          ...(pesos.ubigeoPorDefecto ? { ubigeoPorDefecto: true } : {}),
          ...serializar(paso),
          primaAnual: anual.toFixed(2),
          totalEnCuotas: totalCuotas.toFixed(2),
        },
      };
    });
  }

  /** null si falta un peso obligatorio (nunca se asume 1,00); ubigeo opcional → 1,00. */
  private resolverPesos(
    v: VehiculoCotizable,
    t: TarifaAseguradora,
  ): { w: Pesos; ubigeoPorDefecto: boolean } | null {
    const buscar: Record<PesoNombre, () => Decimal | undefined> = {
      marca: () => t.pesoMarca.get(v.marcaId),
      modelo: () => t.pesoModelo.get(v.modeloId),
      anio: () => t.pesoAnio.get(v.anio),
      tipo: () => t.pesoTipo.get(v.tipoId),
      ubigeo: () => t.pesoUbigeo.get(v.ubigeo),
    };
    const w = {} as Pesos;
    for (const nombre of this.pesosRequeridos) {
      const p = buscar[nombre]();
      if (!p) return null;
      w[nombre] = p;
    }
    let ubigeoPorDefecto = false;
    for (const nombre of this.pesosOpcionales) {
      const p = buscar[nombre]();
      if (!p) ubigeoPorDefecto ||= nombre === 'ubigeo';
      w[nombre] = p ?? new Decimal(1);
    }
    return { w, ubigeoPorDefecto };
  }
}

/** RN-37: punto medio del rango redondeado a USD 100 (half-up), sin salir del rango. */
export function sumaInicial(r: { minima: Decimal; maxima: Decimal }): Decimal {
  const medio = r.minima
    .add(r.maxima)
    .div(2)
    .div(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .mul(100);
  return Decimal.min(Decimal.max(medio, r.minima), r.maxima);
}

function noDisponibles(
  t: TarifaAseguradora,
  motivo: 'SIN_RANGO' | 'PESO_FALTANTE',
): ResultadoPlan[] {
  return t.planes.map((p) => ({
    planId: p.planId,
    disponible: false,
    motivoNoDisponible: motivo,
  }));
}

/** Decimal → string para que el desglose se guarde como JSON legible. */
function serializar(paso: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(paso).map(([k, v]) => [
      k,
      Decimal.isDecimal(v) ? (v as Decimal).toString() : v,
    ]),
  );
}
