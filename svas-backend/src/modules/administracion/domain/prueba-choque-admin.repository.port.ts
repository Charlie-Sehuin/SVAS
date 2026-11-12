import type { UsoVehiculo, ZonaRiesgo } from '../../../shared/types/enums';
import type {
  CoberturaVista,
  EscenarioAdminVista,
  EscenarioParaGuardar,
  FactorVista,
  FilaCobertura,
  FilaFactor,
  FilaFrecuencia,
  FilaZona,
  FrecuenciaVista,
  PlanActivo,
  ResumenCargaChoque,
  ZonaVista,
} from './prueba-choque-admin';

/**
 * Catálogo de la Prueba de Choque con el JWT del administrador: lecturas por
 * RLS (0026: solo ADMINISTRADOR ve coberturas, frecuencias, zonas y factores)
 * y escrituras por los RPC de 0029 (bitácora en la misma transacción).
 */
export interface PruebaChoqueAdminRepository {
  listarEscenarios(token: string): Promise<EscenarioAdminVista[]>;
  guardarEscenario(
    token: string,
    codigo: string,
    e: EscenarioParaGuardar,
  ): Promise<EscenarioAdminVista>;

  listarCoberturas(
    token: string,
    filtros: { planId?: string; escenario?: string },
  ): Promise<CoberturaVista[]>;
  guardarCoberturas(
    token: string,
    filas: FilaCobertura[],
  ): Promise<ResumenCargaChoque>;

  listarFrecuencias(
    token: string,
    filtros: { escenario?: string; uso?: UsoVehiculo },
  ): Promise<FrecuenciaVista[]>;
  guardarFrecuencias(
    token: string,
    filas: FilaFrecuencia[],
  ): Promise<ResumenCargaChoque>;

  listarZonas(token: string, zona?: ZonaRiesgo): Promise<ZonaVista[]>;
  guardarZonas(token: string, filas: FilaZona[]): Promise<ResumenCargaChoque>;

  listarFactores(token: string, escenario?: string): Promise<FactorVista[]>;
  guardarFactores(
    token: string,
    filas: FilaFactor[],
  ): Promise<ResumenCargaChoque>;

  /** Planes activos de aseguradoras activas (para saber qué coberturas faltan). */
  planesActivos(token: string): Promise<PlanActivo[]>;
}

export const PRUEBA_CHOQUE_ADMIN_REPOSITORY = Symbol(
  'PRUEBA_CHOQUE_ADMIN_REPOSITORY',
);
