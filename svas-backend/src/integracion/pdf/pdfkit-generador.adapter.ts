import { Injectable } from '@nestjs/common';
import type { GeneradorPdf } from '../../modules/polizas/domain/generador-pdf.port';
import { noImplementado } from '../no-implementado';

/** PENDIENTE (Ola 3): PDFKit → bucket privado `polizas` (migración 0019). */
@Injectable()
export class PdfkitGeneradorAdapter implements GeneradorPdf {
  generarPoliza(): ReturnType<GeneradorPdf['generarPoliza']> {
    return noImplementado('GeneradorPdf (PDFKit)', 'Ola 3');
  }
}
