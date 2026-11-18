import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { LeerTarjetaUseCase } from '../application/leer-tarjeta.use-case';

const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS_PERMITIDOS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

interface ArchivoSubido {
  buffer: Buffer;
  mimetype: string;
}

/**
 * Tarjeta de propiedad (foto o PDF) → placa, marca, modelo y año. Público (se
 * cotiza sin cuenta) pero con límite bajo: cada llamada cuesta. El archivo no
 * se guarda ni se registra.
 */
@Public()
@Controller('catalogo/vehiculos')
export class LeerTarjetaController {
  constructor(private readonly leerTarjeta: LeerTarjetaUseCase) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('leer-tarjeta')
  @UseInterceptors(
    FileInterceptor('tarjeta', {
      limits: { fileSize: MAX_BYTES, files: 1 },
    }),
  )
  leer(@UploadedFile() tarjeta?: ArchivoSubido) {
    if (!tarjeta) {
      throw new BadRequestException('Falta la tarjeta (campo "tarjeta")');
    }
    if (!TIPOS_PERMITIDOS.includes(tarjeta.mimetype)) {
      throw new BadRequestException(
        'La tarjeta debe ser una imagen JPG, PNG o WEBP, o un PDF',
      );
    }
    return this.leerTarjeta.ejecutar({
      datos: tarjeta.buffer,
      mimeType: tarjeta.mimetype,
    });
  }
}
