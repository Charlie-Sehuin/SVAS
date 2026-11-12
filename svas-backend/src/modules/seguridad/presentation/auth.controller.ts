import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { IniciarSesionUseCase } from '../application/iniciar-sesion.use-case';
import { RefrescarSesionUseCase } from '../application/refrescar-sesion.use-case';
import { RegistrarClienteUseCase } from '../application/registrar-cliente.use-case';
import type { RespuestaSesion } from '../application/sesion-autorizada.service';
import { LoginDto, RefreshDto, RegistroDto } from './dto/auth.dto';

/** Públicos y con rate limit estricto: 20 req/min por IP (arquitectura backend §3.2). */
@Public()
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly iniciarSesion: IniciarSesionUseCase,
    private readonly registrarCliente: RegistrarClienteUseCase,
    private readonly refrescarSesion: RefrescarSesionUseCase,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<RespuestaSesion> {
    return this.iniciarSesion.ejecutar(dto.email, dto.password);
  }

  @Post('registro')
  registro(@Body() dto: RegistroDto): Promise<RespuestaSesion> {
    return this.registrarCliente.ejecutar(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto): Promise<RespuestaSesion> {
    return this.refrescarSesion.ejecutar(dto.refresh_token);
  }
}
