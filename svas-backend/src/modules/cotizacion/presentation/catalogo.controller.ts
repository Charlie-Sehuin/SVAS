import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { CatalogoPublicoService } from '../application/catalogo-publico.service';
import { DistritosQuery, ProvinciasQuery } from './dto/catalogo.dto';

const uuid = (que: string) =>
  new ParseUUIDPipe({
    exceptionFactory: () => new BadRequestException(`${que} no es válido`),
  });

/**
 * Catálogo del formulario de cotización (doc conexión §4). Público: se cotiza
 * sin cuenta. Solo datos de catálogo, nunca tarifas.
 */
@Public()
@Controller('catalogo')
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoPublicoService) {}

  /** Unión de los campos activos de las aseguradoras activas (RN-17). */
  @Get('campos')
  campos() {
    return this.catalogo.campos();
  }

  @Get('vehiculos/marcas')
  marcas() {
    return this.catalogo.marcas();
  }

  @Get('vehiculos/marcas/:marcaId/modelos')
  modelos(@Param('marcaId', uuid('La marca')) marcaId: string) {
    return this.catalogo.modelos(marcaId);
  }

  @Get('vehiculos/modelos/:modeloId/anios')
  anios(@Param('modeloId', uuid('El modelo')) modeloId: string) {
    return this.catalogo.anios(modeloId);
  }

  @Get('ubigeos/departamentos')
  departamentos() {
    return this.catalogo.departamentos();
  }

  @Get('ubigeos/provincias')
  provincias(@Query() q: ProvinciasQuery) {
    return this.catalogo.provincias(q.departamento);
  }

  @Get('ubigeos/distritos')
  distritos(@Query() q: DistritosQuery) {
    return this.catalogo.distritos(q.departamento, q.provincia);
  }
}
