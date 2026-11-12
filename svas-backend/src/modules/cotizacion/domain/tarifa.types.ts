import type Decimal from 'decimal.js';

/** Tipos de la tarifa (arquitectura backend §3.6.1). Dominio puro: sin NestJS ni Supabase. */

export type PesoNombre = 'marca' | 'modelo' | 'anio' | 'tipo' | 'ubigeo';

export interface PlanTarifa {
  planId: string;
  nombre: string;
  tasaBase: Decimal; // tarifa_plan.tasa_base
  parametros: Record<string, unknown>; // tarifa_plan.parametros (lo valida el zod de la Estrategia)
}

/** Todo lo que una aseguradora necesita para calcular. Ya cargado: la Estrategia no hace I/O. */
export interface TarifaAseguradora {
  aseguradoraId: string;
  planes: PlanTarifa[];
  rangos: Map<string, { minima: Decimal; maxima: Decimal }>; // clave `${modeloId}:${anio}`
  pesoMarca: Map<string, Decimal>; // por marcaId
  pesoModelo: Map<string, Decimal>; // por modeloId
  pesoAnio: Map<number, Decimal>; // por año
  pesoTipo: Map<string, Decimal>; // por tipoId   (solo La Positiva)
  pesoUbigeo: Map<string, Decimal>; // por ubigeo   (solo Pacífico)
}

export interface VehiculoCotizable {
  marcaId: string;
  modeloId: string;
  tipoId: string;
  anio: number;
  ubigeo: string;
}

export interface ResultadoPlan {
  planId: string;
  disponible: boolean;
  motivoNoDisponible?: 'SIN_RANGO' | 'PESO_FALTANTE' | 'ERROR_ESTRATEGIA'; // RN-39
  sumaAsegurada?: Decimal;
  prima?: Decimal; // prima ANUAL (al contado)
  primaMensual?: Decimal; // cuota si paga en 12 meses (RN-38)
  detalleCalculo?: Record<string, unknown>; // RN-41: instantánea del cálculo
}
