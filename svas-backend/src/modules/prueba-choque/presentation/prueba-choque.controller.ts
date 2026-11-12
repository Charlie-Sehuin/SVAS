import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthOpcional } from '../../../common/decorators/auth-opcional.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import type { RequestConContexto } from '../../../common/types/usuario-autenticado';
import { CotizacionAccesoGuard } from '../../cotizacion/presentation/cotizacion-acceso.guard';
import { PruebaChoqueService } from '../application/prueba-choque.service';
import { ResumenSimulacionPdfService } from '../application/resumen-pdf.service';
import { EscenariosQueryDto, SimularDto } from './dto/prueba-choque.dto';

/** Catálogo público de escenarios. */
@Controller('prueba-choque')
export class PruebaChoqueController {
  constructor(private readonly pruebaChoque: PruebaChoqueService) {}

  @Public()
  @Get('escenarios')
  escenarios(@Query() q: EscenariosQueryDto) {
    return this.pruebaChoque.escenarios(q.uso);
  }
}

/** Prueba de Choque de una cotización: Bearer o X-Cotizacion-Token (§8.2). */
@Controller('cotizaciones')
export class CotizacionPruebaChoqueController {
  constructor(
    private readonly pruebaChoque: PruebaChoqueService,
    private readonly resumenPdf: ResumenSimulacionPdfService,
  ) {}

  @AuthOpcional()
  @UseGuards(CotizacionAccesoGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':id/prueba-choque')
  simular(
    @Param('id') id: string,
    @Body() dto: SimularDto,
    @Req() req: RequestConContexto,
  ) {
    return this.pruebaChoque.simular(
      id,
      dto.perfil,
      req.accesoCotizacion === 'JWT' ? req.accessToken : undefined,
    );
  }

  @AuthOpcional()
  @UseGuards(CotizacionAccesoGuard)
  @Get(':id/prueba-choque')
  ultima(@Param('id') id: string) {
    return this.pruebaChoque.ultima(id);
  }

  /** Resumen de 1 página para compartir (application/pdf). */
  @AuthOpcional()
  @UseGuards(CotizacionAccesoGuard)
  @Get(':id/prueba-choque/pdf')
  async pdf(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pdf = await this.resumenPdf.generar(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="prueba-de-choque.pdf"',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(pdf);
  }
}
