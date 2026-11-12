import { Inject, Injectable } from '@nestjs/common';
import { GENERADOR_PDF, type GeneradorPdf } from '../domain/generador-pdf.port';
import {
  POLIZAS_REPOSITORY,
  type PolizasRepository,
} from '../domain/polizas.repository.port';

/**
 * Arma el PDF de una póliza ya emitida y lo sube a Storage (backend §6, paso e).
 * Corre fuera de la transacción de la compra: si falla, la póliza sigue
 * válida con pdf_generado_en = null y el job la reintenta.
 * Repetirlo es seguro: la ruta es fija y la subida reemplaza el archivo.
 */
@Injectable()
export class EmitirPdfService {
  constructor(
    @Inject(POLIZAS_REPOSITORY) private readonly repo: PolizasRepository,
    @Inject(GENERADOR_PDF) private readonly generador: GeneradorPdf,
  ) {}

  async generar(polizaId: string): Promise<void> {
    const poliza = await this.repo.datosPdf(polizaId);
    if (!poliza) throw new Error(`La póliza ${polizaId} no existe`);
    const pdf = await this.generador.generarPoliza(poliza.datos);
    await this.repo.subirPdf(poliza.archivoPdf, pdf);
    await this.repo.marcarPdfGenerado(polizaId);
  }

  /** Igual que generar(), pero devuelve false en vez de lanzar (para la compra y la descarga). */
  async intentar(polizaId: string): Promise<boolean> {
    try {
      await this.generar(polizaId);
      return true;
    } catch {
      return false;
    }
  }
}
