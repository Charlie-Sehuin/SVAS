import type Decimal from 'decimal.js';
import { aDinero, redondear } from '../../../common/utils/money.util';
import type { ContenidoCongelado } from '../../polizas/domain/poliza';
import type {
  CanalVenta,
  EstadoCotizacion,
  EstadoPago,
  ModoPago,
  TipoDescuento,
} from '../../../shared/types/enums';

/** Formatos que también valida la base (0034/0035). */
export const FORMATO_DOCUMENTO = /^([0-9]{8}|[0-9A-Z]{9,12})$/;
export const FORMATO_PLACA = /^[A-Z0-9]{3}-?[0-9]{3}$/;

/** RNF-08: lo único que la compra pide si la cotización no lo capturó. */
export const CAMPOS_COMPRA = {
  numeroDocumento: {
    etiqueta: 'Número de documento',
    ayuda: 'DNI de 8 dígitos o carné de extranjería de 9 a 12 caracteres',
  },
  placa: { etiqueta: 'Placa del vehículo', ayuda: 'Formato ABC-123' },
} as const;
export type CampoCompra = keyof typeof CAMPOS_COMPRA;

export interface CampoFaltante {
  campo: CampoCompra;
  etiqueta: string;
  ayuda: string;
}

export function camposFaltantes(d: {
  numeroDocumento: string | null;
  placa: string | null;
}): CampoFaltante[] {
  return (Object.keys(CAMPOS_COMPRA) as CampoCompra[])
    .filter((c) => !d[c])
    .map((c) => ({ campo: c, ...CAMPOS_COMPRA[c] }));
}

/** La cotización vista por su dueño, con lo que la compra necesita saber. */
export interface CotizacionCompra {
  id: string;
  estado: EstadoCotizacion;
  numeroDocumento: string | null;
  placa: string | null;
  /** Orden ya creada para esta cotización (hay una como máximo). */
  orden: { id: string; primaCotizadaId: string } | null;
}

/** Una prima de la cotización con su plan y aseguradora. */
export interface PrimaCompra {
  primaCotizadaId: string;
  planId: string;
  plan: string;
  aseguradoraId: string;
  aseguradora: string;
  codigoEstrategia: string;
  sumaAsegurada: Decimal;
  prima: Decimal;
  disponible: boolean;
}

export interface DescuentoCompra {
  tipo: TipoDescuento;
  porcentaje: Decimal;
}

export interface PagoOrden {
  id: string;
  modo: ModoPago;
  monto: Decimal;
  numeroCuotas: number | null;
  estado: EstadoPago;
  referencia: string;
  fecha: string;
  cuotas: {
    numero: number;
    monto: Decimal;
    fechaVencimiento: string;
    estado: EstadoPago;
  }[];
}

/** La orden con todo lo que pagar y consultar su estado necesitan. */
export interface OrdenCompra {
  id: string;
  cotizacionId: string;
  primaCotizadaId: string;
  planId: string;
  sumaAsegurada: Decimal;
  primaAnual: Decimal;
  descuento: DescuentoCompra | null;
  primaFinal: Decimal;
  canalVenta: CanalVenta;
  fecha: string;
  contenidoPlan: ContenidoCongelado;
  /** null si el plan o la aseguradora ya no están activos. */
  tarifa: { aseguradoraId: string; codigoEstrategia: string } | null;
  pagos: PagoOrden[];
  poliza: { id: string; numero: string; pdfDisponible: boolean } | null;
}

/** prima_final = round(prima_anual × (1 − pct/100), 2), igual que ck_orden_prima. */
export function primaConDescuento(
  primaAnual: Decimal,
  porcentaje: Decimal | null,
): Decimal {
  if (!porcentaje) return redondear(primaAnual);
  return redondear(
    primaAnual.times(aDinero(1).minus(porcentaje.dividedBy(100))),
  );
}

/** Recargo por fraccionar en % sobre la prima final (0.00 si no hay). */
export function recargoPorcentaje(
  primaFinal: Decimal,
  total: Decimal,
): Decimal {
  if (primaFinal.isZero()) return aDinero(0);
  return redondear(total.dividedBy(primaFinal).minus(1).times(100));
}
