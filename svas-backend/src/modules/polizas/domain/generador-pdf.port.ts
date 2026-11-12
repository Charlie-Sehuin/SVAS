/**
 * Puerto 4/6 · PDF de la póliza (arquitectura backend §6: PDFKit → Storage,
 * fuera de la transacción). El contenido sale de orden_compra.contenido_plan
 * (copia del plan al comprar, RN-45), no de las tablas vivas.
 * Los campos exactos de `datos` se cierran en la Ola 3.
 */
export interface DatosPolizaPdf {
  polizaId: string;
  numeroPoliza: string;
  datos: Record<string, unknown>;
}

export interface GeneradorPdf {
  /** Genera el PDF y lo sube al bucket privado `polizas`. Devuelve la ruta: `polizas/<polizaId>.pdf`. */
  generarPoliza(i: DatosPolizaPdf): Promise<{ archivoPdf: string }>;
}

export const GENERADOR_PDF = Symbol('GENERADOR_PDF');
