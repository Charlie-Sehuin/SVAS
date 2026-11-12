import type Decimal from 'decimal.js';
import type {
  UsoVehiculo,
  VariablePerfil,
  ZonaRiesgo,
} from '../../../shared/types/enums';
import type { EscenarioMotor, ReglaMotor } from './motor-simulacion';

export interface EscenarioCatalogo extends EscenarioMotor {
  nombre: string;
  descripcion: string;
  orden: number;
}

/** Todo lo que el motor necesita, leído en un solo paso (service_role). */
export interface CatalogoSimulacion {
  zona: ZonaRiesgo;
  escenarios: EscenarioCatalogo[];
  reglas: ReglaMotor[];
  probabilidades: Map<string, Decimal>;
  factores: {
    escenarioId: string;
    variable: VariablePerfil;
    multiplicador: Decimal;
  }[];
  tipoCambio: Decimal;
}

/** Lo que va al RPC 6.2 (montos como string decimal). */
export interface SimulacionParaGuardar {
  perfil: Record<string, unknown>;
  zona: ZonaRiesgo;
  versionReglas: string;
  planes: {
    primaCotizadaId: string;
    costoRealAnual: string;
    peorCaso: string;
    ranking: number;
    datosCompletos: boolean;
  }[];
  resultados: {
    primaCotizadaId: string;
    escenarioId: string;
    sinDato: boolean;
    cubre: boolean | null;
    probabilidad: string;
    dano: string;
    cubierto: string;
    deducible: string;
    noCubierto: string;
    ingresoPerdido: string;
    desembolso: string;
  }[];
}

/** Instantánea guardada (RN-32): se muestra tal cual, nunca se recalcula. */
export interface SimulacionGuardada {
  id: string;
  zona: ZonaRiesgo;
  fecha: string;
  vigente: boolean;
  planes: {
    primaCotizadaId: string;
    aseguradora: string;
    plan: string;
    costoRealAnual: Decimal;
    peorCaso: Decimal;
    ranking: number;
    datosCompletos: boolean;
  }[];
  resultados: {
    primaCotizadaId: string;
    escenario: { id: string; codigo: string; nombre: string; orden: number };
    sinDato: boolean;
    cubre: boolean | null;
    probabilidad: Decimal;
    deducible: Decimal;
    noCubierto: Decimal;
    ingresoPerdido: Decimal;
    desembolso: Decimal;
  }[];
}

export interface PruebaChoqueRepository {
  escenariosActivos(): Promise<EscenarioCatalogo[]>;
  /** Probabilidad por escenario para un uso en zona MEDIA (referencia pública). */
  probabilidadesReferenciales(uso: UsoVehiculo): Promise<Map<string, Decimal>>;
  catalogo(d: {
    planIds: string[];
    uso: UsoVehiculo;
    ubigeo: string;
  }): Promise<CatalogoSimulacion>;
  /** RPC 6.2. Con accessToken corre como el CLIENTE dueño; sin él, como service_role. */
  registrar(
    cotizacionId: string,
    s: SimulacionParaGuardar,
    accessToken?: string,
  ): Promise<{ simulacionId: string }>;
  /** Última simulación de la cotización (service_role; el acceso lo validó el guard). */
  ultima(cotizacionId: string): Promise<SimulacionGuardada | null>;
}

export const PRUEBA_CHOQUE_REPOSITORY = Symbol('PRUEBA_CHOQUE_REPOSITORY');
