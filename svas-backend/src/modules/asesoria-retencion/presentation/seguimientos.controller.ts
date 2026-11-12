import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AccessToken } from '../../../common/decorators/access-token.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../../../common/types/usuario-autenticado';
import { SeguimientosService } from '../application/seguimientos.service';
import { uuidValido } from './asesorias.controller';
import {
  CierreSeguimientoDto,
  IntentoDto,
  SeguimientosQueryDto,
} from './dto/asesoria.dto';

/** CU-04 Seguimiento / telemarketing (doc conexión §6). El ADMINISTRADOR solo lee. */
@Controller('seguimientos')
export class SeguimientosController {
  constructor(private readonly seguimientos: SeguimientosService) {}

  @Roles('ASESOR', 'ADMINISTRADOR')
  @Get()
  listar(@AccessToken() accessToken: string, @Query() q: SeguimientosQueryDto) {
    return this.seguimientos.listar(accessToken, q.estado);
  }

  @Roles('ASESOR', 'ADMINISTRADOR')
  @Get(':id')
  detalle(
    @AccessToken() accessToken: string,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', uuidValido('El seguimiento')) id: string,
  ) {
    return this.seguimientos.detalle(accessToken, usuario, id);
  }

  @Roles('ASESOR')
  @Post(':id/intentos')
  intento(
    @AccessToken() accessToken: string,
    @Param('id', uuidValido('El seguimiento')) id: string,
    @Body() dto: IntentoDto,
  ) {
    return this.seguimientos.registrarIntento(
      accessToken,
      id,
      dto.canal,
      dto.resultado,
    );
  }

  @Roles('ASESOR')
  @HttpCode(200)
  @Post(':id/aceptacion')
  aceptacion(
    @AccessToken() accessToken: string,
    @Param('id', uuidValido('El seguimiento')) id: string,
  ) {
    return this.seguimientos.aceptacion(accessToken, id);
  }

  @Roles('ASESOR')
  @HttpCode(200)
  @Post(':id/cierre')
  cierre(
    @AccessToken() accessToken: string,
    @Param('id', uuidValido('El seguimiento')) id: string,
    @Body() dto: CierreSeguimientoDto,
  ) {
    return this.seguimientos.cerrar(
      accessToken,
      id,
      dto.estado,
      dto.motivo ?? null,
    );
  }
}
