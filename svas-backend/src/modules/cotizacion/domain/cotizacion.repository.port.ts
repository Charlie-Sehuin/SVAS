import type Decimal from 'decimal.js';
import type {
  CanalContacto,
  EstadoCotizacion,
  MotivoAsesoria,
  OpcionVenta,
  UsoVehiculo,
} from '../../../shared/types/enums';
import type { ResultadoPlan } from './tarifa.types';

export interface ContactoCotizacion {
  nombres: string;
  apellidos: string;
  telefono: string;
  email: string;
  canalPreferido: CanalContacto;
}

export interface NuevaCotizacion {
  contacto: ContactoCotizacion;
  vehiculo: {
    uso: UsoVehiculo;
    modeloId: string;
    anio: number;
    clase?: string | null;
    placa?: string | null;
    ubigeo: string;
  };
  tokenHash: string;
  opciones: OpcionVenta[];
  motivoDerivacion: MotivoAsesoria | null;
  primas: ResultadoPlan[];
}

export interface CotizacionRegistrada {
  cotizacionId: string;
  fecha: string;
  primas: { id: string; planId: string }[];
}

export interface PrimaGuardada {
  id: string;
  planId: string;
  plan: string;
  aseguradoraId: string;
  aseguradora: string;
  disponible: boolean;
  motivoNoDisponible: string | null;
  sumaAsegurada: Decimal | null;
  prima: Decimal | null;
  primaMensual: Decimal | null;
  detalleCalculo: Record<string, unknown> | null;
}

export interface CotizacionGuardada {
  id: string;
  fecha: string;
  estado: EstadoCotizacion;
  motivoDerivacion: MotivoAsesoria | null;
  opciones: OpcionVenta[];
  tokenHash: string;
  vehiculo: {
    uso: UsoVehiculo;
    marcaId: string;
    marca: string;
    modeloId: string;
    modelo: string;
    tipoId: string;
    tipo: string;
    anio: number;
    ubigeo: string;
    distrito: string;
    placa: string | null;
    clase: string | null;
  };
  primas: PrimaGuardada[];
}

export interface CotizacionDeLista {
  id: string;
  fecha: string;
  estado: EstadoCotizacion;
  marca: string;
  modelo: string;
  anio: number;
  primaMensualDesde: Decimal | null;
}

/**
 * Persistencia de cotizaciones. Los métodos con `accessToken` corren como ese
 * usuario (RLS / RPC con auth.uid()); los demás, como sistema (service_role)
 * después de que el backend validó el token de cotización.
 */
export interface CotizacionRepository {
  /** RPC 6.1 (service_role). */
  registrar(c: NuevaCotizacion): Promise<CotizacionRegistrada>;
  /** Cotización completa (service_role). null si no existe. */
  obtener(id: string): Promise<CotizacionGuardada | null>;
  /** Lo mínimo para validar X-Cotizacion-Token (service_role). */
  obtenerAcceso(
    id: string,
  ): Promise<{ tokenHash: string; estado: EstadoCotizacion } | null>;
  /** ¿El usuario ve esta cotización por RLS? (dueño, asesor del caso o admin). */
  esVisiblePara(accessToken: string, id: string): Promise<boolean>;
  /** RPC 6.13. Con accessToken corre como el CLIENTE dueño; sin él, como service_role. */
  actualizarSuma(
    cotizacionId: string,
    aseguradoraId: string,
    primas: ResultadoPlan[],
    accessToken?: string,
  ): Promise<{ simulacionesInvalidadas: number }>;
  /** RPC vincular_cliente (service_role; el backend ya verificó el JWT). */
  vincularCliente(d: {
    usuarioId: string;
    cotizacionId: string;
    tokenHash: string | null;
    contacto: Partial<Omit<ContactoCotizacion, 'email'>>;
  }): Promise<{ clienteId: string }>;
  /** Cotizaciones del usuario autenticado (RLS). */
  listarMias(accessToken: string): Promise<CotizacionDeLista[]>;
  /** Vehículos ya asegurados (cotización CONVERTIDA) de la persona, para RN-05. */
  contarAsegurados(
    email: string,
    telefono: string,
  ): Promise<{ particular: number; comercial: number }>;
}

export const COTIZACION_REPOSITORY = Symbol('COTIZACION_REPOSITORY');
