import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { RegistrarClienteUseCase } from '../application/registrar-cliente.use-case';
import { RegistroDto } from './dto/registro.dto';
import { aUsuarioResponse, type UsuarioResponseDto } from './dto/usuarios.dto';

/**
 * Login, refresh y logout NO pasan por aquí: el frontend los hace con
 * supabase-js (doc frontend §9.3) y el backend solo verifica el JWT.
 * Registro sí, porque el alta pública de Supabase está desactivada y hay que
 * crear el perfil CLIENTE en svas.usuario. Público, 20 req/min por IP (§3.2).
 */
@Public()
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly registrarCliente: RegistrarClienteUseCase) {}

  @Post('registro')
  async registro(@Body() dto: RegistroDto): Promise<UsuarioResponseDto> {
    return aUsuarioResponse(await this.registrarCliente.ejecutar(dto));
  }
}
