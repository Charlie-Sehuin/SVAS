import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { nombreDescarga, type PolizaResumen } from '../domain/poliza';
import {
  POLIZAS_REPOSITORY,
  type PolizasRepository,
} from '../domain/polizas.repository.port';
import { EmitirPdfService } from './emitir-pdf.service';

export const WARNING_PDF_EN_GENERACION = {
  code: 'PDF_EN_GENERACION',
  message: 'Tu póliza se está generando. Vuelve a intentarlo en unos segundos.',
} as const;

export type DescargaPoliza =
  | { listo: true; pdf: Buffer; nombreArchivo: string }
  | { listo: false; warning: typeof WARNING_PDF_EN_GENERACION };

/** RF-25 / RF-26: el cliente ve y descarga sus pólizas (doc conexión §6 y §7). */
@Injectable()
export class PolizasService {
  private readonly logger = new Logger(PolizasService.name);

  constructor(
    @Inject(POLIZAS_REPOSITORY) private readonly repo: PolizasRepository,
    private readonly emitir: EmitirPdfService,
  ) {}

  mias(accessToken: string): Promise<PolizaResumen[]> {
    return this.repo.mias(accessToken);
  }

  /**
   * La propiedad la decide RLS: si no es suya, no la ve (404, no se distingue).
   * Si el PDF aún no existe, intenta generarlo una vez; si tampoco sale,
   * responde "en generación" (202) y el job lo reintenta.
   */
  async descargar(
    accessToken: string,
    polizaId: string,
  ): Promise<DescargaPoliza> {
    const poliza = await this.repo.deUsuario(accessToken, polizaId);
    if (!poliza) throw new NotFoundException('La póliza no existe');

    if (!poliza.pdfGenerado && !(await this.emitir.intentar(poliza.id))) {
      this.logger.warn(`PDF de la póliza ${poliza.id} todavía no disponible`);
      return { listo: false, warning: WARNING_PDF_EN_GENERACION };
    }
    return {
      listo: true,
      pdf: await this.repo.descargarPdf(poliza.archivoPdf),
      nombreArchivo: nombreDescarga(poliza.numero),
    };
  }
}
