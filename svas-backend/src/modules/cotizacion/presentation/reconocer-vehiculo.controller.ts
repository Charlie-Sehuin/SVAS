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
import { ReconocerVehiculoUseCase } from '../application/reconocer-vehiculo.use-case';

const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];

interface ArchivoSubido {
  buffer: Buffer;
  mimetype: string;
}

/**
 * Foto del auto → marca, modelo y años sugeridos. Público (se cotiza sin
 * cuenta) pero con límite bajo: cada llamada cuesta. La foto no se guarda.
 */
@Public()
@Controller('catalogo/vehiculos')
export class ReconocerVehiculoController {
  constructor(private readonly reconocer: ReconocerVehiculoUseCase) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reconocer')
  @UseInterceptors(
    FileInterceptor('foto', {
      limits: { fileSize: MAX_BYTES, files: 1 },
    }),
  )
  reconocerFoto(@UploadedFile() foto?: ArchivoSubido) {
    if (!foto) throw new BadRequestException('Falta la foto (campo "foto")');
    if (!TIPOS_PERMITIDOS.includes(foto.mimetype)) {
      throw new BadRequestException('La foto debe ser JPG, PNG o WEBP');
    }
    return this.reconocer.ejecutar({
      datos: foto.buffer,
      mimeType: foto.mimetype,
    });
  }
}
