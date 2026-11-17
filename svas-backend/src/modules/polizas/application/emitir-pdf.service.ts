import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { enmascararEmail } from '../../../common/utils/mask.util';
import {
  ENVIADOR_CORREO,
  type EnviadorCorreo,
} from '../domain/enviador-correo.port';
import { GENERADOR_PDF, type GeneradorPdf } from '../domain/generador-pdf.port';
import { nombreDescarga, type DatosPolizaPdf } from '../domain/poliza';
import {
  POLIZAS_REPOSITORY,
  type PolizasRepository,
} from '../domain/polizas.repository.port';
import { armarCorreoPoliza, esCorreoDeDemostracion } from './correo-poliza';

/**
 * Arma el PDF de una póliza ya emitida y lo sube a Storage (backend §6, paso e).
 * Corre fuera de la transacción de la compra: si falla, la póliza sigue
 * válida con pdf_generado_en = null y el job la reintenta.
 * Repetirlo es seguro: la ruta es fija y la subida reemplaza el archivo.
 * Al generarlo por primera vez, además lo manda al correo del titular (sin
 * esperar la respuesta y sin que un fallo del correo afecte a la compra).
 */
@Injectable()
export class EmitirPdfService {
  private readonly logger = new Logger(EmitirPdfService.name);

  constructor(
    @Inject(POLIZAS_REPOSITORY) private readonly repo: PolizasRepository,
    @Inject(GENERADOR_PDF) private readonly generador: GeneradorPdf,
    @Optional()
    @Inject(ENVIADOR_CORREO)
    private readonly correo?: EnviadorCorreo,
  ) {}

  async generar(polizaId: string): Promise<void> {
    const poliza = await this.repo.datosPdf(polizaId);
    if (!poliza) throw new Error(`La póliza ${polizaId} no existe`);
    const pdf = await this.generador.generarPoliza(poliza.datos);
    await this.repo.subirPdf(poliza.archivoPdf, pdf);
    await this.repo.marcarPdfGenerado(polizaId);
    // generar() solo corre mientras el PDF no existe (compra, descarga o reintento): el correo sale una vez.
    void this.enviarPorCorreo(poliza.datos, pdf);
  }

  /** Manda la póliza al correo del titular. Nunca lanza: un correo que falla no debe afectar a la compra. */
  private async enviarPorCorreo(d: DatosPolizaPdf, pdf: Buffer): Promise<void> {
    if (!this.correo) return;
    const para = d.correoTitular?.trim();
    if (!para) {
      this.logger.warn(
        `Póliza ${d.numeroPoliza}: el titular no tiene correo; no se envió el PDF`,
      );
      return;
    }
    if (esCorreoDeDemostracion(para)) return;
    try {
      const r = await this.correo.enviar({
        para,
        ...armarCorreoPoliza(d),
        adjuntos: [
          {
            nombre: nombreDescarga(d.numeroPoliza),
            contenido: pdf,
            tipo: 'application/pdf',
          },
        ],
        claveIdempotencia: `poliza-${d.polizaId}`,
      });
      this.logger.log(
        `Póliza ${d.numeroPoliza}: PDF enviado a ${enmascararEmail(para)} (${r.referencia ?? 'sin referencia'})`,
      );
    } catch (e) {
      this.logger.warn(
        `Póliza ${d.numeroPoliza}: no se pudo enviar el PDF a ${enmascararEmail(para)}: ${(e as Error).message}`,
      );
    }
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
