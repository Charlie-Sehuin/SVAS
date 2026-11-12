import type Decimal from 'decimal.js';
import type { ContenidoPlan } from '../../planes/domain/contenido-plan';
import type { ModoPago } from '../../../shared/types/enums';
import type {
  CotizacionCompra,
  DescuentoCompra,
  OrdenCompra,
  PrimaCompra,
} from './compra';

export interface VistaPreviaDescuento extends DescuentoCompra {
  /** true = el cliente aún no dio su documento; la primera compra se confirma al crear la orden. */
  provisional: boolean;
}

export interface NuevaOrden {
  cotizacionId: string;
  primaCotizadaId: string;
  origen: 'RETOMA' | null;
  contenidoPlan: ContenidoPlan;
  aceptaCondiciones: boolean;
  firmaSimulada: string;
}

export interface PagoParaRegistrar {
  ordenId: string;
  modo: ModoPago;
  numeroCuotas: number | null;
  referencia: string;
  montoTotal: Decimal;
}

export interface CompraConfirmada {
  polizaId: string;
  numeroPoliza: string;
  pagoId: string;
}

/**
 * Lecturas con el JWT del cliente (RLS: solo lo suyo) y escrituras por RPC
 * (0034/0035). max_cuotas lo lee con service_role: parametros_comerciales no
 * es visible para CLIENTE y es un dato comercial público.
 */
export interface CompraRepository {
  cotizacion(
    token: string,
    cotizacionId: string,
  ): Promise<CotizacionCompra | null>;
  prima(
    token: string,
    cotizacionId: string,
    primaCotizadaId: string,
  ): Promise<PrimaCompra | null>;
  vistaPreviaDescuento(
    token: string,
    cotizacionId: string,
    primaCotizadaId: string,
  ): Promise<VistaPreviaDescuento | null>;
  maxCuotas(): Promise<number>;
  completarDatos(
    token: string,
    cotizacionId: string,
    datos: { numeroDocumento?: string; placa?: string },
  ): Promise<{ numeroDocumento: string | null; placa: string | null }>;
  /** Devuelve el id de la orden creada. */
  crearOrden(token: string, orden: NuevaOrden): Promise<string>;
  orden(token: string, ordenId: string): Promise<OrdenCompra | null>;
  registrarRechazo(token: string, pago: PagoParaRegistrar): Promise<void>;
  confirmar(
    token: string,
    pago: PagoParaRegistrar & { numeroPoliza: string },
  ): Promise<CompraConfirmada>;
}

export const COMPRA_REPOSITORY = Symbol('COMPRA_REPOSITORY');
