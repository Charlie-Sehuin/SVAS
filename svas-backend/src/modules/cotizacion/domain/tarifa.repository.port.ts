import type { TarifaAseguradora } from './tarifa.types';

/** Tarifa de una aseguradora lista para su Estrategia (arquitectura backend §3.6.1). */
export interface TarifaRepository {
  /** Solo planes activos con tarifa_plan. Caché de 5 minutos. */
  cargar(aseguradoraId: string): Promise<TarifaAseguradora>;
  /** Lo llama el administrador al guardar tarifas; sin id limpia todo. */
  invalidar(aseguradoraId?: string): void;
}

export const TARIFA_REPOSITORY = Symbol('TARIFA_REPOSITORY');
