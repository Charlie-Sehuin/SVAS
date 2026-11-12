import type { DatosPolizaPdf } from './poliza';

/** Resumen de 1 página de la Prueba de Choque (contexto §10). Montos como string. */
export interface DatosSimulacionPdf {
  fecha: string;
  zona: string;
  vigente: boolean;
  ranking: {
    posicion: number;
    aseguradora: string;
    plan: string;
    prima: string;
    desembolsoEsperado: string;
    costoRealAnual: string;
    peorCaso: string;
    datosCompletos: boolean;
  }[];
  /** Frase de mayor contraste (RN-35); null si no hay. */
  contraste: string | null;
  /** RN-29. */
  leyenda: string;
}

/** Reporte de ventas (RF-30), tal como lo devuelve la RPC reporte_ventas. */
export interface DatosVentasPdf {
  desde: string;
  hasta: string;
  agrupar: string;
  generadoEn: string;
  totales: {
    polizas: number;
    enCuotas: number;
    primaAnual: string;
    descuentos: string;
    primaFinal: string;
    cobrado: string;
    ticketPromedio: string | null;
  };
  grupos: {
    etiqueta: string;
    polizas: number;
    enCuotas: number;
    primaFinal: string;
    cobrado: string;
    ticketPromedio: string;
    participacion: string | null;
  }[];
}

/**
 * Puerto 4/6 · PDFs (arquitectura backend §6). Solo dibuja: guardar o servir
 * el archivo es trabajo de quien lo pide. La póliza sale de
 * orden_compra.contenido_plan (copia del plan al comprar, RN-45).
 */
export interface GeneradorPdf {
  generarPoliza(datos: DatosPolizaPdf): Promise<Buffer>;
  generarSimulacion(datos: DatosSimulacionPdf): Promise<Buffer>;
  generarReporteVentas(datos: DatosVentasPdf): Promise<Buffer>;
}

export const GENERADOR_PDF = Symbol('GENERADOR_PDF');
