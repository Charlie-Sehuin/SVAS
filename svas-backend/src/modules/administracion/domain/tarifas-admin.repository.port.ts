import type { PesoNombre } from '../../cotizacion/domain/tarifa.types';
import type {
  FaltanteTarifa,
  FilaPeso,
  FilaRango,
  PesoVista,
  RangoVista,
  ResumenCarga,
  TablaPeso,
  TarifaPlanVista,
} from './tarifas';

export interface AseguradoraTarifa {
  id: string;
  codigoEstrategia: string;
  nombre: string;
  activa: boolean;
}

/**
 * Tarifas con el JWT del administrador: lecturas por RLS (solo ADMINISTRADOR
 * ve tarifas) y escrituras por los RPC de 0023 (bitácora en la misma transacción).
 */
export interface TarifasAdminRepository {
  listarAseguradoras(token: string): Promise<AseguradoraTarifa[]>;
  /** Código de estrategia de la aseguradora dueña del plan; null si el plan no existe. */
  codigoEstrategiaDelPlan(
    token: string,
    planId: string,
  ): Promise<string | null>;

  listarTarifasPlanes(
    token: string,
    aseguradoraId?: string,
  ): Promise<TarifaPlanVista[]>;
  guardarTarifaPlan(
    token: string,
    planId: string,
    tasaBase: number,
    parametros: Record<string, unknown>,
  ): Promise<TarifaPlanVista>;

  listarPesos(
    token: string,
    tabla: TablaPeso,
    aseguradoraId: string,
  ): Promise<PesoVista[]>;
  guardarPesos(
    token: string,
    tabla: TablaPeso,
    aseguradoraId: string,
    filas: FilaPeso[],
  ): Promise<ResumenCarga>;

  listarRangos(
    token: string,
    filtros: { aseguradoraId: string; marcaId?: string; modeloId?: string },
  ): Promise<RangoVista[]>;
  guardarRangos(
    token: string,
    aseguradoraId: string,
    filas: FilaRango[],
  ): Promise<ResumenCarga>;

  /** Modelos-año sin rango o a los que les falta alguno de los pesos indicados. */
  listarFaltantes(
    token: string,
    aseguradoraId: string,
    pesosRequeridos: readonly PesoNombre[],
  ): Promise<FaltanteTarifa[]>;
}

export const TARIFAS_ADMIN_REPOSITORY = Symbol('TARIFAS_ADMIN_REPOSITORY');
