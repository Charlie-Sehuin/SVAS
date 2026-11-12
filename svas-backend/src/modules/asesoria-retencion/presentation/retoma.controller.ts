import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { RetomaService } from '../application/retoma.service';

/** Enlace de retoma (RN-12): público, un solo uso. */
@Controller('retoma')
export class RetomaController {
  constructor(private readonly retoma: RetomaService) {}

  /** → { cotizacionId, tokenAcceso, descuento }. tokenAcceso sale UNA sola vez. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get(':token')
  resolver(@Param('token') token: string) {
    return this.retoma.resolver(token);
  }
}
