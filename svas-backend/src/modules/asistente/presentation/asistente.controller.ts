import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthOpcional } from '../../../common/decorators/auth-opcional.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { CotizacionAccesoGuard } from '../../cotizacion/presentation/cotizacion-acceso.guard';
import { ConversarUseCase } from '../application/conversar.use-case';
import { MAX_TEXTO_USUARIO } from '../domain/asistente';
import { ConversarDto } from './dto/asistente.dto';

/** Cada mensaje cuesta una llamada a la IA: límite bajo por IP. */
const LIMITE = { default: { limit: 12, ttl: 60_000 } };

function revisarLargo(dto: ConversarDto): void {
  if (
    dto.mensajes.some(
      (m) => m.rol === 'usuario' && m.texto.length > MAX_TEXTO_USUARIO,
    )
  ) {
    throw new BadRequestException(
      `Tu mensaje es muy largo: escribe hasta ${MAX_TEXTO_USUARIO} caracteres`,
    );
  }
}

/**
 * Chatbot del sitio público. Dos puertas:
 * - sin cotización (cualquier visitante): recomienda por coberturas, sin precios;
 * - con cotización (Bearer o X-Cotizacion-Token): usa los precios de esa cotización.
 * No guarda nada: el frontend reenvía la conversación en cada turno.
 */
@Controller()
export class AsistenteController {
  constructor(private readonly conversar: ConversarUseCase) {}

  @Public()
  @Throttle(LIMITE)
  @HttpCode(200)
  @Post('asistente/mensajes')
  general(@Body() dto: ConversarDto) {
    revisarLargo(dto);
    return this.conversar.ejecutar({
      mensajes: dto.mensajes,
      vehiculo: dto.vehiculo,
    });
  }

  @AuthOpcional()
  @UseGuards(CotizacionAccesoGuard)
  @Throttle(LIMITE)
  @HttpCode(200)
  @Post('cotizaciones/:id/asistente/mensajes')
  conCotizacion(@Param('id') id: string, @Body() dto: ConversarDto) {
    revisarLargo(dto);
    return this.conversar.ejecutar({
      mensajes: dto.mensajes,
      cotizacionId: id,
    });
  }
}
