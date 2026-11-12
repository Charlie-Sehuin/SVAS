import type { DatosPolizaPdf } from './poliza';

/**
 * Puerto 4/6 · PDF de la póliza (arquitectura backend §6). Solo dibuja el
 * documento: subirlo a Storage es trabajo del repositorio de pólizas, fuera
 * de la transacción de la compra. El contenido sale de
 * orden_compra.contenido_plan (copia del plan al comprar, RN-45).
 */
export interface GeneradorPdf {
  generarPoliza(datos: DatosPolizaPdf): Promise<Buffer>;
}

export const GENERADOR_PDF = Symbol('GENERADOR_PDF');
