import type Decimal from 'decimal.js';
import type { ContenidoPlan } from '../../planes/domain/contenido-plan';
import type { EstadoPago, ModoPago } from '../../../shared/types/enums';
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

/** Lo que responde el RPC `pagar_cuotas` (0041): el cobro aplicado y el cronograma completo. */
export interface CuotasPagadas {
  /** true = la misma referencia ya se había aplicado: no se cobró otra vez. */
  repetido: boolean;
  referencia: string;
  montoPagado: Decimal;
  cuotasPagadas: number[];
  cuotas: {
    numero: number;
    monto: Decimal;
    fechaVencimiento: string;
    estado: EstadoPago;
  }[];
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
  /** Marca como pagadas las primeras `cantidad` cuotas pendientes (siempre en orden). Idempotente por `clave`. */
  pagarCuotas(
    token: string,
    p: {
      ordenId: string;
      cantidad: number;
      referencia: string;
      /** La Idempotency-Key del cliente: con la misma clave, la base responde lo mismo sin pagar otra vez. */
      clave: string;
      monto: Decimal;
    },
  ): Promise<CuotasPagadas>;
}

export const COMPRA_REPOSITORY = Symbol('COMPRA_REPOSITORY');
