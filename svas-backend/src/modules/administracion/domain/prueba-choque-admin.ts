import type {
  CondicionTaller,
  UsoVehiculo,
  VariablePerfil,
  ZonaRiesgo,
} from '../../../shared/types/enums';

/**
 * Catálogo de la Prueba de Choque visto por el administrador (contexto §4.1,
 * §16, RN-31). Montos, porcentajes y probabilidades salen como string decimal.
 */

export interface EscenarioAdminVista {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  /** null = el daño es la suma asegurada de cada plan (ROBO_TOTAL, PERDIDA_TOTAL). */
  montoDanoReferencial: string | null;
  diasTaller: number;
  orden: number;
  activo: boolean;
}

export interface EscenarioParaGuardar {
  nombre: string;
  descripcion: string;
  montoDanoReferencial: number | null;
  diasTaller: number;
  orden: number;
  activo: boolean;
}

export interface CoberturaVista {
  planId: string;
  plan: string;
  aseguradora: string;
  escenario: string;
  cubre: boolean;
  deduciblePct: string | null;
  deducibleMinimo: string | null;
  /** null = hasta la suma asegurada. */
  topeCobertura: string | null;
  condicionTaller: CondicionTaller;
  diasAutoReemplazo: number;
  fuente: string;
  actualizadoEn: string;
}

export interface FilaCobertura {
  planId: string;
  escenario: string;
  cubre: boolean;
  deduciblePct?: number | null;
  deducibleMinimo?: number | null;
  topeCobertura?: number | null;
  condicionTaller?: CondicionTaller;
  diasAutoReemplazo?: number;
  fuente: string;
}

export interface FrecuenciaVista {
  escenario: string;
  uso: UsoVehiculo;
  zona: ZonaRiesgo;
  probabilidadAnual: string;
}

export interface FilaFrecuencia {
  escenario: string;
  uso: UsoVehiculo;
  zona: ZonaRiesgo;
  probabilidadAnual: number;
}

export interface ZonaVista {
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  zona: ZonaRiesgo;
}

export interface FilaZona {
  ubigeo: string;
  zona: ZonaRiesgo;
}

export interface FactorVista {
  escenario: string;
  variable: VariablePerfil;
  multiplicador: string;
}

export interface FilaFactor {
  escenario: string;
  variable: VariablePerfil;
  multiplicador: number;
}

export interface PlanActivo {
  planId: string;
  plan: string;
  aseguradora: string;
}

export interface ResumenCargaChoque {
  recibidas: number;
  cambiadas: number;
  total: number;
}

/** Lo que le falta a un escenario activo para que la simulación no quede coja. */
export interface PendientesEscenario {
  /** Combinaciones uso × zona sin probabilidad (el motor las toma como 0). */
  frecuenciasFaltantes: { uso: UsoVehiculo; zona: ZonaRiesgo }[];
  /** Planes activos sin fila de cobertura: salen "Sin información" (RN-30). */
  planesSinCobertura: PlanActivo[];
}

/**
 * Frecuencias y coberturas que faltan para un escenario. Función pura para
 * poder probarla sin base de datos.
 */
export function pendientesDeEscenario(
  codigo: string,
  frecuencias: Pick<FrecuenciaVista, 'escenario' | 'uso' | 'zona'>[],
  coberturas: Pick<CoberturaVista, 'escenario' | 'planId'>[],
  planesActivos: PlanActivo[],
  usos: readonly UsoVehiculo[],
  zonas: readonly ZonaRiesgo[],
): PendientesEscenario {
  const conFrecuencia = new Set(
    frecuencias
      .filter((f) => f.escenario === codigo)
      .map((f) => `${f.uso}|${f.zona}`),
  );
  const conCobertura = new Set(
    coberturas.filter((c) => c.escenario === codigo).map((c) => c.planId),
  );
  return {
    frecuenciasFaltantes: usos.flatMap((uso) =>
      zonas
        .filter((zona) => !conFrecuencia.has(`${uso}|${zona}`))
        .map((zona) => ({ uso, zona })),
    ),
    planesSinCobertura: planesActivos.filter(
      (p) => !conCobertura.has(p.planId),
    ),
  };
}
