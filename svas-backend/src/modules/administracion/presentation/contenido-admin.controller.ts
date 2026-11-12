import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { AccessToken } from '../../../common/decorators/access-token.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ContenidoAdminService } from '../application/contenido-admin.service';
import {
  CodigoCoberturaParam,
  GuardarContenidoPlanDto,
  GuardarCoberturaDto,
} from './dto/contenido-admin.dto';

const planValido = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('El plan no es válido'),
});

/**
 * Contenido comercial de los planes (contexto §18, CU-06 paso 3): solo el
 * ADMINISTRADOR escribe, por RPC y con rastro en la bitácora (RN-46).
 */
@Roles('ADMINISTRADOR')
@Controller('admin')
export class ContenidoAdminController {
  constructor(private readonly servicio: ContenidoAdminService) {}

  @Get('planes/:planId/contenido')
  contenido(
    @AccessToken() token: string,
    @Param('planId', planValido) planId: string,
  ) {
    return this.servicio.obtener(token, planId);
  }

  @Put('planes/:planId/contenido')
  guardarContenido(
    @AccessToken() token: string,
    @Param('planId', planValido) planId: string,
    @Body() dto: GuardarContenidoPlanDto,
  ) {
    return this.servicio.guardar(token, planId, dto);
  }

  @Get('coberturas')
  coberturas(@AccessToken() token: string) {
    return this.servicio.listarCoberturas(token);
  }

  /** Crea la cobertura si el código no existe; si existe, la reemplaza. */
  @Put('coberturas/:codigo')
  guardarCobertura(
    @AccessToken() token: string,
    @Param() p: CodigoCoberturaParam,
    @Body() dto: GuardarCoberturaDto,
  ) {
    return this.servicio.guardarCobertura(token, p.codigo, dto);
  }

  @Get('contenido-planes/completitud')
  completitud(@AccessToken() token: string) {
    return this.servicio.completitud(token);
  }
}
