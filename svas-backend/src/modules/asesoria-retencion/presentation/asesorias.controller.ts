import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AccessToken } from '../../../common/decorators/access-token.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../../../common/types/usuario-autenticado';
import { AsesoriasService } from '../application/asesorias.service';
import {
  ColaQueryDto,
  DescuentoDto,
  ResultadoSolicitudDto,
  SolicitarAsesoriaDto,
} from './dto/asesoria.dto';

export const uuidValido = (que: string) =>
  new ParseUUIDPipe({
    exceptionFactory: () => new BadRequestException(`${que} no es válida`),
  });

/** CU-03 Asesoría / descuento (doc conexión §6). El ADMINISTRADOR solo lee. */
@Controller('asesorias')
export class AsesoriasController {
  constructor(private readonly asesorias: AsesoriasService) {}

  @Roles('CLIENTE')
  @Post()
  solicitar(
    @AccessToken() accessToken: string,
    @Body() dto: SolicitarAsesoriaDto,
  ) {
    return this.asesorias.solicitar(accessToken, dto);
  }

  @Roles('ASESOR', 'ADMINISTRADOR')
  @Get('cola')
  cola(
    @AccessToken() accessToken: string,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() q: ColaQueryDto,
  ) {
    return this.asesorias.cola(accessToken, usuario.id, q);
  }

  @Roles('ASESOR', 'ADMINISTRADOR')
  @Get(':id')
  detalle(
    @AccessToken() accessToken: string,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', uuidValido('La solicitud')) id: string,
  ) {
    return this.asesorias.detalle(accessToken, usuario, id);
  }

  @Roles('ASESOR')
  @HttpCode(200)
  @Post(':id/tomar')
  tomar(
    @AccessToken() accessToken: string,
    @Param('id', uuidValido('La solicitud')) id: string,
  ) {
    return this.asesorias.tomar(accessToken, id);
  }

  @Roles('ASESOR')
  @Post(':id/descuentos')
  descuento(
    @AccessToken() accessToken: string,
    @Param('id', uuidValido('La solicitud')) id: string,
    @Body() dto: DescuentoDto,
  ) {
    return this.asesorias.aplicarDescuento(
      accessToken,
      id,
      dto.planId,
      dto.porcentaje,
    );
  }

  @Roles('ASESOR')
  @HttpCode(200)
  @Post(':id/resultado')
  resultado(
    @AccessToken() accessToken: string,
    @Param('id', uuidValido('La solicitud')) id: string,
    @Body() dto: ResultadoSolicitudDto,
  ) {
    return this.asesorias.cerrar(accessToken, id, dto.resultado, dto.acepta);
  }
}
