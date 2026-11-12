import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { AccessToken } from '../../../common/decorators/access-token.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ReportesService } from '../application/reportes.service';
import { PeriodoQueryDto, VentasQueryDto } from './dto/reportes.dto';

/** Reportes del administrador (RF-30, OE3, RN-07, §16.7). */
@Roles('ADMINISTRADOR')
@Controller('admin/reportes')
export class AdminReportesController {
  constructor(private readonly reportes: ReportesService) {}

  /** JSON; con ?formato=pdf, el archivo para descargar. */
  @Get('ventas')
  async ventas(
    @AccessToken() token: string,
    @Query() q: VentasQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (q.formato !== 'pdf') return this.reportes.ventas(token, q);
    const { pdf, nombreArchivo } = await this.reportes.ventasPdf(token, q);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(pdf);
  }

  @Get('retencion')
  retencion(@AccessToken() token: string, @Query() q: PeriodoQueryDto) {
    return this.reportes.retencion(token, q);
  }

  @Get('descuentos')
  descuentos(@AccessToken() token: string, @Query() q: PeriodoQueryDto) {
    return this.reportes.descuentos(token, q);
  }

  /** ★ Impacto de la Prueba de Choque. */
  @Get('prueba-choque')
  pruebaChoque(@AccessToken() token: string, @Query() q: PeriodoQueryDto) {
    return this.reportes.pruebaChoque(token, q);
  }
}

/** El asesor ve solo su propio desempeño. */
@Roles('ASESOR')
@Controller('asesor/reportes')
export class AsesorReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Get('mi-desempeno')
  miDesempeno(@AccessToken() token: string, @Query() q: PeriodoQueryDto) {
    return this.reportes.miDesempeno(token, q);
  }
}
