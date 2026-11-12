import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccessToken } from '../../../common/decorators/access-token.decorator';
import { AuthOpcional } from '../../../common/decorators/auth-opcional.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type {
  RequestConContexto,
  UsuarioAutenticado,
} from '../../../common/types/usuario-autenticado';
import {
  AjustarSumaUseCase,
  CotizarUseCase,
  MisCotizacionesUseCase,
  ObtenerResumenUseCase,
  VincularClienteUseCase,
} from '../application/cotizaciones.use-cases';
import {
  CotizacionAccesoGuard,
  HEADER_TOKEN_COTIZACION,
} from './cotizacion-acceso.guard';
import {
  AjustarSumaDto,
  CotizarDto,
  VincularClienteDto,
} from './dto/cotizacion.dto';

const uuid = (que: string) =>
  new ParseUUIDPipe({
    exceptionFactory: () => new BadRequestException(`${que} no es válida`),
  });

/** El desglose de la prima solo llega a ASESOR y ADMINISTRADOR (RN-41, doc conexión §5). */
const verDesglose = (req: RequestConContexto) =>
  (req.accesoCotizacion === 'JWT' &&
    req.usuario?.roles.some((r) => r === 'ASESOR' || r === 'ADMINISTRADOR')) ??
  false;

/** CU-01 Cotizar y comparar (contexto §8.1, doc conexión §6). */
@Controller('cotizaciones')
export class CotizacionesController {
  constructor(
    private readonly cotizar: CotizarUseCase,
    private readonly resumen: ObtenerResumenUseCase,
    private readonly ajustarSuma: AjustarSumaUseCase,
    private readonly vincular: VincularClienteUseCase,
    private readonly mias: MisCotizacionesUseCase,
  ) {}

  /** Público: se cotiza sin cuenta. Devuelve tokenAcceso UNA sola vez. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  crear(@Body() dto: CotizarDto) {
    return this.cotizar.ejecutar(dto);
  }

  /** Cotizaciones del CLIENTE con sesión (RLS). */
  @Roles('CLIENTE')
  @Get('mias')
  listarMias(@AccessToken() accessToken: string) {
    return this.mias.ejecutar(accessToken);
  }

  /** Bearer o X-Cotizacion-Token. */
  @AuthOpcional()
  @UseGuards(CotizacionAccesoGuard)
  @Get(':id/resumen')
  obtenerResumen(@Param('id') id: string, @Req() req: RequestConContexto) {
    return this.resumen.ejecutar(id, verDesglose(req));
  }

  /** Bearer (CLIENTE dueño) o X-Cotizacion-Token. Recalcula solo esa aseguradora. */
  @AuthOpcional()
  @UseGuards(CotizacionAccesoGuard)
  @Patch(':id/aseguradoras/:aseguradoraId/suma-asegurada')
  ajustar(
    @Param('id') id: string,
    @Param('aseguradoraId', uuid('La aseguradora')) aseguradoraId: string,
    @Body() dto: AjustarSumaDto,
    @Req() req: RequestConContexto,
  ) {
    return this.ajustarSuma.ejecutar({
      cotizacionId: id,
      aseguradoraId,
      sumaAsegurada: dto.sumaAsegurada,
      accessToken: req.accesoCotizacion === 'JWT' ? req.accessToken : undefined,
      verDesglose: verDesglose(req),
    });
  }

  /**
   * Vincula la cotización a la cuenta del CLIENTE (backend §4.4) y/o actualiza
   * su contacto. Si la cotización era anónima exige su X-Cotizacion-Token.
   */
  @Roles('CLIENTE')
  @Patch(':id/cliente')
  vincularCliente(
    @Param('id', uuid('La cotización')) id: string,
    @Body() dto: VincularClienteDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Headers(HEADER_TOKEN_COTIZACION) tokenAcceso?: string,
  ) {
    return this.vincular.ejecutar({
      usuarioId: usuario.id,
      cotizacionId: id,
      tokenAcceso: tokenAcceso || undefined,
      contacto: dto,
    });
  }
}
