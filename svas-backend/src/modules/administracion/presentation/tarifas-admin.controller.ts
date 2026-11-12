import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AccessToken } from '../../../common/decorators/access-token.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { TarifasAdminService } from '../application/tarifas-admin.service';
import {
  AseguradoraOpcionalQuery,
  AseguradoraQuery,
  GuardarPesosDto,
  GuardarRangosDto,
  GuardarTarifaPlanDto,
  RangosQuery,
  SimularTarifaDto,
  TablaPesoParam,
} from './dto/tarifas-admin.dto';

const planValido = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('El plan no es válido'),
});

/**
 * Tarifas (contexto §17): tasas base, parámetros por plan, pesos y rangos de
 * suma. Secreto comercial: solo ADMINISTRADOR (§7).
 */
@Roles('ADMINISTRADOR')
@Controller('admin/tarifas')
export class TarifasAdminController {
  constructor(private readonly tarifas: TarifasAdminService) {}

  @Get('planes')
  planes(@AccessToken() token: string, @Query() q: AseguradoraOpcionalQuery) {
    return this.tarifas.listarTarifasPlanes(token, q.aseguradoraId);
  }

  @Put('planes/:planId')
  guardarPlan(
    @AccessToken() token: string,
    @Param('planId', planValido) planId: string,
    @Body() dto: GuardarTarifaPlanDto,
  ) {
    return this.tarifas.guardarTarifaPlan(
      token,
      planId,
      dto.tasaBase,
      dto.parametros,
    );
  }

  @Get('pesos/:tabla')
  pesos(
    @AccessToken() token: string,
    @Param() p: TablaPesoParam,
    @Query() q: AseguradoraQuery,
  ) {
    return this.tarifas.listarPesos(token, p.tabla, q.aseguradoraId);
  }

  @Put('pesos/:tabla')
  guardarPesos(
    @AccessToken() token: string,
    @Param() p: TablaPesoParam,
    @Body() dto: GuardarPesosDto,
  ) {
    return this.tarifas.guardarPesos(
      token,
      p.tabla,
      dto.aseguradoraId,
      dto.filas,
    );
  }

  @Get('rangos-suma')
  rangos(@AccessToken() token: string, @Query() q: RangosQuery) {
    return this.tarifas.listarRangos(token, q);
  }

  @Put('rangos-suma')
  guardarRangos(@AccessToken() token: string, @Body() dto: GuardarRangosDto) {
    return this.tarifas.guardarRangos(token, dto.aseguradoraId, dto.filas);
  }

  @Get('completitud')
  completitud(
    @AccessToken() token: string,
    @Query() q: AseguradoraOpcionalQuery,
  ) {
    return this.tarifas.completitud(token, q.aseguradoraId);
  }

  /** Calcula las primas de todas las aseguradoras con el desglose (no guarda nada). */
  @Post('simular')
  simular(@Body() dto: SimularTarifaDto) {
    return this.tarifas.simular(dto);
  }
}
