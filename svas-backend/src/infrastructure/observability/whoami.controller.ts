import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../../common/types/usuario-autenticado';

/**
 * TEMPORAL: prueba de punta a punta de SupabaseAuthGuard + RolesGuard.
 * Se elimina en la Ola 0, cuando exista GET /auth/me en modules/seguridad.
 */
@Controller('dev')
export class WhoamiController {
  @Get('whoami')
  @Roles('ADMINISTRADOR')
  whoami(@CurrentUser() usuario: UsuarioAutenticado) {
    return usuario;
  }
}
