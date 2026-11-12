import type Decimal from 'decimal.js';
import type { z } from 'zod';
import type {
  PesoNombre,
  PlanTarifa,
  ResultadoPlan,
  TarifaAseguradora,
  VehiculoCotizable,
} from './tarifa.types';

/** Puerto 1/6 · Una fórmula por aseguradora (arquitectura backend §3.6.1, doc contexto §17). */

export const CODIGOS_ESTRATEGIA = [
  'RIMAC',
  'PACIFICO',
  'LA_POSITIVA',
  'MAPFRE',
  'QUALITAS',
] as const;
export type CodigoEstrategia = (typeof CODIGOS_ESTRATEGIA)[number];

export interface EstrategiaCotizacion {
  readonly codigo: CodigoEstrategia;
  readonly parametrosSchema: z.ZodType; // valida tarifa_plan.parametros al guardar y al cargar
  /** Pesos sin los que no hay prima (RN-39: falta uno → PESO_FALTANTE). */
  readonly pesosRequeridos: readonly PesoNombre[];
  /** Pesos que usa pero tienen valor por defecto (ubigeo de Pacífico = 1,00). */
  readonly pesosOpcionales: readonly PesoNombre[];

  /** Un ResultadoPlan por plan. Sin `suma` usa el punto medio del rango (RN-37).
   *  Suma fuera de rango → lanza SumaFueraDeRangoException (400, no "no disponible"). */
  cotizar(
    v: VehiculoCotizable,
    tarifa: TarifaAseguradora,
    suma?: Decimal,
  ): Promise<ResultadoPlan[]>;

  /** Total que paga el cliente en cuotas sobre la prima final (ya con descuento, RN-38). */
  totalEnCuotas(primaFinal: Decimal, plan: PlanTarifa): Decimal;
}

/** Resuelve la estrategia por aseguradora.codigo_estrategia. */
export interface RegistroEstrategias {
  obtener(codigo: string): EstrategiaCotizacion;
  todas(): readonly EstrategiaCotizacion[];
}

export const REGISTRO_ESTRATEGIAS = Symbol('REGISTRO_ESTRATEGIAS');
