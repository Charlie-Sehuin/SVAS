import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  type DatosVentasPdf,
  GENERADOR_PDF,
  type GeneradorPdf,
} from '../../polizas/domain/generador-pdf.port';
import {
  type AgruparVentas,
  type Periodo,
  resolverPeriodo,
} from '../domain/reportes';
import {
  REPORTES_REPOSITORY,
  type ReportesRepository,
} from '../domain/reportes.repository.port';

export interface ConsultaPeriodo {
  desde?: string;
  hasta?: string;
}

/** Reportes del panel (doc conexión §6 "Reportes"); el cálculo vive en 0036. */
@Injectable()
export class ReportesService {
  constructor(
    @Inject(REPORTES_REPOSITORY) private readonly repo: ReportesRepository,
    @Inject(GENERADOR_PDF) private readonly pdf: GeneradorPdf,
  ) {}

  ventas(token: string, q: ConsultaPeriodo & { agrupar?: AgruparVentas }) {
    return this.repo.ventas(token, this.periodo(q), q.agrupar ?? 'canal');
  }

  /** ?formato=pdf: el mismo reporte dibujado (RF-30). */
  async ventasPdf(
    token: string,
    q: ConsultaPeriodo & { agrupar?: AgruparVentas },
  ): Promise<{ pdf: Buffer; nombreArchivo: string }> {
    const r = (await this.ventas(token, q)) as unknown as Omit<
      DatosVentasPdf,
      'generadoEn'
    >;
    const pdf = await this.pdf.generarReporteVentas({
      ...r,
      generadoEn: new Date().toISOString(),
    });
    return { pdf, nombreArchivo: `ventas-${r.desde}-a-${r.hasta}.pdf` };
  }

  retencion(token: string, q: ConsultaPeriodo) {
    return this.repo.retencion(token, this.periodo(q));
  }

  descuentos(token: string, q: ConsultaPeriodo) {
    return this.repo.descuentos(token, this.periodo(q));
  }

  pruebaChoque(token: string, q: ConsultaPeriodo) {
    return this.repo.pruebaChoque(token, this.periodo(q));
  }

  miDesempeno(token: string, q: ConsultaPeriodo) {
    return this.repo.miDesempeno(token, this.periodo(q));
  }

  private periodo(q: ConsultaPeriodo): Periodo {
    const p = resolverPeriodo(q);
    if (typeof p === 'string') throw new BadRequestException(p);
    return p;
  }
}
