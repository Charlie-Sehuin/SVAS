import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { AccessToken } from '../../../common/decorators/access-token.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PruebaChoqueAdminService } from '../application/prueba-choque-admin.service';
import {
  CoberturasQuery,
  CodigoEscenarioParam,
  FactoresQuery,
  FrecuenciasQuery,
  GuardarCoberturasDto,
  GuardarEscenarioDto,
  GuardarFactoresDto,
  GuardarFrecuenciasDto,
  GuardarZonasDto,
  ZonasQuery,
} from './dto/prueba-choque-admin.dto';

/**
 * Catálogo de la Prueba de Choque (contexto §16, RN-31): los valores
 * referenciales del seed 0027 los ajusta el administrador. Cada guardado pasa
 * por un RPC de 0029 que deja el antes/después en la bitácora.
 */
@Roles('ADMINISTRADOR')
@Controller('admin/prueba-choque')
export class PruebaChoqueAdminController {
  constructor(private readonly servicio: PruebaChoqueAdminService) {}

  @Get('escenarios')
  escenarios(@AccessToken() token: string) {
    return this.servicio.listarEscenarios(token);
  }

  /** Crea el escenario si el código no existe; si existe, lo reemplaza. */
  @Put('escenarios/:codigo')
  guardarEscenario(
    @AccessToken() token: string,
    @Param() p: CodigoEscenarioParam,
    @Body() dto: GuardarEscenarioDto,
  ) {
    return this.servicio.guardarEscenario(token, p.codigo, dto);
  }

  @Get('coberturas')
  coberturas(@AccessToken() token: string, @Query() q: CoberturasQuery) {
    return this.servicio.listarCoberturas(token, q);
  }

  @Put('coberturas')
  guardarCoberturas(
    @AccessToken() token: string,
    @Body() dto: GuardarCoberturasDto,
  ) {
    return this.servicio.guardarCoberturas(token, dto.filas);
  }

  @Get('frecuencias')
  frecuencias(@AccessToken() token: string, @Query() q: FrecuenciasQuery) {
    return this.servicio.listarFrecuencias(token, q);
  }

  @Put('frecuencias')
  guardarFrecuencias(
    @AccessToken() token: string,
    @Body() dto: GuardarFrecuenciasDto,
  ) {
    return this.servicio.guardarFrecuencias(token, dto.filas);
  }

  /** Solo los distritos con zona propia; el resto cuenta como MEDIA. */
  @Get('zonas')
  zonas(@AccessToken() token: string, @Query() q: ZonasQuery) {
    return this.servicio.listarZonas(token, q.zona);
  }

  @Put('zonas')
  guardarZonas(@AccessToken() token: string, @Body() dto: GuardarZonasDto) {
    return this.servicio.guardarZonas(token, dto.filas);
  }

  @Get('factores')
  factores(@AccessToken() token: string, @Query() q: FactoresQuery) {
    return this.servicio.listarFactores(token, q.escenario);
  }

  @Put('factores')
  guardarFactores(
    @AccessToken() token: string,
    @Body() dto: GuardarFactoresDto,
  ) {
    return this.servicio.guardarFactores(token, dto.filas);
  }
}
