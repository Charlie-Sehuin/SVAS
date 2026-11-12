import type { DatosPolizaPdf, PolizaResumen } from './poliza';

/** La póliza tal como la ve su dueño (RLS). */
export interface PolizaDelUsuario {
  id: string;
  numero: string;
  archivoPdf: string;
  pdfGenerado: boolean;
}

export interface PolizasRepository {
  // ── Con el JWT del cliente (RLS: solo lo suyo) ──
  mias(accessToken: string): Promise<PolizaResumen[]>;
  /** null si no existe o no es suya (no se distingue, doc conexión §8). */
  deUsuario(
    accessToken: string,
    polizaId: string,
  ): Promise<PolizaDelUsuario | null>;

  // ── service_role: generación del PDF y job ──
  datosPdf(
    polizaId: string,
  ): Promise<{ archivoPdf: string; datos: DatosPolizaPdf } | null>;
  subirPdf(archivoPdf: string, pdf: Buffer): Promise<void>;
  marcarPdfGenerado(polizaId: string): Promise<void>;
  descargarPdf(archivoPdf: string): Promise<Buffer>;
  /** Pólizas sin PDF emitidas antes de `antesDe`, las más antiguas primero. */
  pendientes(antesDe: Date, limite: number): Promise<string[]>;
}

export const POLIZAS_REPOSITORY = Symbol('POLIZAS_REPOSITORY');
