import { Controller, Get } from '@nestjs/common';
import { AccessToken } from '../../../common/decorators/access-token.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { MisVehiculosUseCase } from '../application/cotizaciones.use-cases';

/** "Mis vehículos" del CLIENTE (panel de la cuenta). */
@Roles('CLIENTE')
@Controller('vehiculos')
export class VehiculosController {
  constructor(private readonly mios: MisVehiculosUseCase) {}

  /** Los autos que la persona ya cotizó, uno por auto, el más reciente primero (RLS: solo los suyos). */
  @Get('mios')
  listar(@AccessToken() accessToken: string) {
    return this.mios.ejecutar(accessToken);
  }
}
