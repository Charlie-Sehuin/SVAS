import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { PlanesService } from '../application/planes.service';
import { CompararPlanesQuery } from './dto/planes.dto';

const planValido = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('El plan no es válido'),
});

/**
 * Contenido comercial de los planes (contexto §18, RN-46): información
 * pública, no requiere JWT ni token de cotización y no afecta la prima.
 */
@Public()
@Controller('planes')
export class PlanesController {
  constructor(private readonly planes: PlanesService) {}

  @Get('comparar')
  comparar(@Query() q: CompararPlanesQuery) {
    return this.planes.comparar(q.ids);
  }

  @Get(':planId/contenido')
  contenido(@Param('planId', planValido) planId: string) {
    return this.planes.contenido(planId);
  }
}
