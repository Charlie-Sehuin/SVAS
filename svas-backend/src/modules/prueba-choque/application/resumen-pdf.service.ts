import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  GENERADOR_PDF,
  type GeneradorPdf,
} from '../../polizas/domain/generador-pdf.port';
import { contrasteRetencion, fraseContraste } from '../domain/contraste';
import {
  PRUEBA_CHOQUE_REPOSITORY,
  type PruebaChoqueRepository,
} from '../domain/prueba-choque.repository.port';
import { armarRespuesta } from './vista-simulacion';

export const SIN_PRUEBA_CHOQUE =
  'Esta cotización todavía no tiene Prueba de Choque';

/**
 * GET /cotizaciones/:id/prueba-choque/pdf (contexto §10): resumen compartible
 * de 1 página desde la instantánea (RN-32). Sin datos del perfil (RN-36).
 */
@Injectable()
export class ResumenSimulacionPdfService {
  constructor(
    @Inject(PRUEBA_CHOQUE_REPOSITORY)
    private readonly repo: PruebaChoqueRepository,
    @Inject(GENERADOR_PDF) private readonly generador: GeneradorPdf,
  ) {}

  async generar(cotizacionId: string): Promise<Buffer> {
    const s = await this.repo.ultima(cotizacionId);
    if (!s) throw new NotFoundException(SIN_PRUEBA_CHOQUE);
    const v = armarRespuesta(s);
    const contraste = contrasteRetencion(s);
    return this.generador.generarSimulacion({
      fecha: v.fecha,
      zona: v.zona,
      vigente: v.vigente,
      ranking: v.ranking,
      contraste: contraste && fraseContraste(contraste),
      leyenda: v.leyenda,
    });
  }
}
