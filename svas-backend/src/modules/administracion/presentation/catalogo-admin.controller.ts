import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AccessToken } from '../../../common/decorators/access-token.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CatalogoAdminService } from '../application/catalogo-admin.service';
import {
  ActualizarParametrosDto,
  BitacoraQuery,
  CambiarEstadoAseguradoraDto,
  CrearCampoDto,
  CrearPlanDto,
  EditarPlanDto,
  FiltroAseguradoraQuery,
  GuardarCampoDto,
  GuardarReglasDto,
} from './dto/catalogo-admin.dto';

const idValido = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('El id no es válido'),
});

/**
 * Panel del administrador: catálogo, parámetros y bitácora (RF-26 a RF-30).
 * Lecturas con RLS (el ADMINISTRADOR ve también lo inactivo) y escrituras por
 * los RPC de 0015, que dejan la bitácora (RNF-12).
 */
@Roles('ADMINISTRADOR')
@Controller('admin')
export class CatalogoAdminController {
  constructor(private readonly catalogo: CatalogoAdminService) {}

  @Get('panel')
  panel(@AccessToken() token: string) {
    return this.catalogo.panel(token);
  }

  // ── Aseguradoras ──────────────────────────────────────────────────────────
  @Get('aseguradoras')
  aseguradoras(@AccessToken() token: string) {
    return this.catalogo.listarAseguradoras(token);
  }

  @Patch('aseguradoras/:id')
  estadoAseguradora(
    @AccessToken() token: string,
    @Param('id', idValido) id: string,
    @Body() dto: CambiarEstadoAseguradoraDto,
  ) {
    return this.catalogo.cambiarEstadoAseguradora(token, id, dto.activa);
  }

  // ── Planes ────────────────────────────────────────────────────────────────
  @Get('planes')
  planes(@AccessToken() token: string, @Query() q: FiltroAseguradoraQuery) {
    return this.catalogo.listarPlanes(token, q.aseguradoraId);
  }

  @Post('planes')
  crearPlan(@AccessToken() token: string, @Body() dto: CrearPlanDto) {
    return this.catalogo.crearPlan(token, dto);
  }

  @Patch('planes/:id')
  editarPlan(
    @AccessToken() token: string,
    @Param('id', idValido) id: string,
    @Body() dto: EditarPlanDto,
  ) {
    return this.catalogo.editarPlan(token, id, dto);
  }

  // ── Campos del formulario ─────────────────────────────────────────────────
  @Get('campos')
  campos(@AccessToken() token: string, @Query() q: FiltroAseguradoraQuery) {
    return this.catalogo.listarCampos(token, q.aseguradoraId);
  }

  @Post('campos')
  crearCampo(@AccessToken() token: string, @Body() dto: CrearCampoDto) {
    const { aseguradoraId, ...campo } = dto;
    return this.catalogo.crearCampo(token, aseguradoraId, campo);
  }

  @Put('campos/:id')
  editarCampo(
    @AccessToken() token: string,
    @Param('id', idValido) id: string,
    @Body() dto: GuardarCampoDto,
  ) {
    return this.catalogo.editarCampo(token, id, dto);
  }

  /** Desactiva (RN-16): el campo deja de pedirse pero no se borra. */
  @Delete('campos/:id')
  desactivarCampo(
    @AccessToken() token: string,
    @Param('id', idValido) id: string,
  ) {
    return this.catalogo.desactivarCampo(token, id);
  }

  // ── Reglas de inspección ──────────────────────────────────────────────────
  @Get('reglas-inspeccion')
  reglas(@AccessToken() token: string) {
    return this.catalogo.listarReglas(token);
  }

  @Put('reglas-inspeccion')
  guardarReglas(@AccessToken() token: string, @Body() dto: GuardarReglasDto) {
    return this.catalogo.guardarReglas(token, dto.reglas);
  }

  // ── Parámetros comerciales ────────────────────────────────────────────────
  @Get('parametros')
  parametros(@AccessToken() token: string) {
    return this.catalogo.obtenerParametros(token);
  }

  @Put('parametros')
  actualizarParametros(
    @AccessToken() token: string,
    @Body() dto: ActualizarParametrosDto,
  ) {
    return this.catalogo.actualizarParametros(token, dto);
  }

  // ── Bitácora ──────────────────────────────────────────────────────────────
  @Get('bitacora')
  bitacora(@AccessToken() token: string, @Query() q: BitacoraQuery) {
    return this.catalogo.listarBitacora(token, q);
  }
}
