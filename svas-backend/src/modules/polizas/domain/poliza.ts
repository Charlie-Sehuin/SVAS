import type { ContenidoPlan } from '../../planes/domain/contenido-plan';
import type {
  CanalVenta,
  ModoPago,
  TipoDescuento,
} from '../../../shared/types/enums';

/** RNF-20: todo PDF emitido lleva esta leyenda (contexto §2, regla 18). */
export const LEYENDA_DEMOSTRACION =
  'Documento de demostración sin validez legal';

/** Bucket privado de Storage (migración 0019). */
export const BUCKET_POLIZAS = 'polizas';

/**
 * Copia del plan guardada en orden_compra.contenido_plan (RN-45, §18.8).
 * Es el ContenidoPlan del momento de comprar más la fecha en que se congeló.
 */
export type ContenidoCongelado = Omit<ContenidoPlan, 'actualizadoEn'> & {
  actualizadoEn?: string | null;
  congeladoEn: string;
};

export interface CuotaPoliza {
  numero: number;
  /** Decimal como string. */
  monto: string;
  /** YYYY-MM-DD */
  fechaVencimiento: string;
  estado: 'PENDIENTE' | 'CONFIRMADO' | 'RECHAZADO';
}

/** Todo lo que el PDF necesita. Sale de la póliza y de su orden, nunca de las tablas vivas del plan. */
export interface DatosPolizaPdf {
  polizaId: string;
  numeroPoliza: string;
  fechaEmision: string;
  canalVenta: CanalVenta;
  titular: {
    nombres: string;
    apellidos: string;
    numeroDocumento: string | null;
  };
  vehiculo: {
    marca: string;
    modelo: string;
    anio: number;
    placa: string | null;
  };
  sumaAsegurada: string;
  primaAnual: string;
  descuento: { tipo: TipoDescuento; porcentaje: string } | null;
  primaFinal: string;
  pago: {
    modo: ModoPago;
    montoTotal: string;
    numeroCuotas: number | null;
    cuotas: CuotaPoliza[];
  };
  contenidoPlan: ContenidoCongelado;
}

/** Fila de GET /polizas/mias. */
export interface PolizaResumen {
  id: string;
  numero: string;
  fechaEmision: string;
  aseguradora: string;
  plan: string;
  vehiculo: {
    marca: string;
    modelo: string;
    anio: number;
    placa: string | null;
  };
  sumaAsegurada: string;
  primaFinal: string;
  pago: {
    modo: ModoPago;
    montoTotal: string;
    numeroCuotas: number | null;
  } | null;
  pdfDisponible: boolean;
  contenidoPlan: ContenidoCongelado;
}

/** Ruta del objeto dentro del bucket: poliza.archivo_pdf es 'polizas/<id>.pdf'. */
export function claveEnBucket(archivoPdf: string): string {
  return archivoPdf.startsWith(`${BUCKET_POLIZAS}/`)
    ? archivoPdf.slice(BUCKET_POLIZAS.length + 1)
    : archivoPdf;
}

/** Nombre con el que se descarga (doc conexión §7): poliza-<numero>.pdf. */
export function nombreDescarga(numeroPoliza: string): string {
  return `poliza-${numeroPoliza.replace(/[^A-Za-z0-9-]/g, '')}.pdf`;
}
