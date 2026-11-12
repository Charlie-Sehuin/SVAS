import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { AccessToken } from '../../../common/decorators/access-token.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PolizasService } from '../application/polizas.service';

const polizaValida = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('La póliza no es válida'),
});

/** Pólizas del cliente (doc conexión §6 "Pólizas" y §7 "Descarga de PDFs"). */
@Roles('CLIENTE')
@Controller('polizas')
export class PolizasController {
  constructor(private readonly polizas: PolizasService) {}

  @Get('mias')
  mias(@AccessToken() accessToken: string) {
    return this.polizas.mias(accessToken);
  }

  /** 200 application/pdf como descarga; 202 + warning PDF_EN_GENERACION si aún no está. */
  @Get(':id/pdf')
  async pdf(
    @AccessToken() accessToken: string,
    @Param('id', polizaValida) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.polizas.descargar(accessToken, id);
    if (!r.listo) {
      res.status(HttpStatus.ACCEPTED);
      return { warning: r.warning };
    }
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${r.nombreArchivo}"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(r.pdf);
  }
}
