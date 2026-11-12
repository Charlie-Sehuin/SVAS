import { Controller, Get, Query } from '@nestjs/common';
import { AccessToken } from '../../../common/decorators/access-token.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ReportesService } from '../application/reportes.service';
import { PeriodoQueryDto, VentasQueryDto } from './dto/reportes.dto';

/** Reportes del administrador (RF-30, OE3, RN-07, §16.7). */
@Roles('ADMINISTRADOR')
@Controller('admin/reportes')
export class AdminReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Get('ventas')
  ventas(@AccessToken() token: string, @Query() q: VentasQueryDto) {
    return this.reportes.ventas(token, q);
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
