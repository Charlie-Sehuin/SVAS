import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AccessToken } from '../../../common/decorators/access-token.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CompraService } from '../application/compra.service';
import { PagarYEmitirUseCase } from '../application/pagar-y-emitir.use-case';
import {
  CrearCompraDto,
  DatosCompraDto,
  FORMATO_IDEMPOTENCY_KEY,
  PagarDto,
  ResumenQueryDto,
} from './dto/compra.dto';

const uuid = (mensaje: string) =>
  new ParseUUIDPipe({
    exceptionFactory: () => new BadRequestException(mensaje),
  });
const cotizacionValida = uuid('La cotización no es válida');
const compraValida = uuid('La compra no es válida');

export const FALTA_IDEMPOTENCY_KEY =
  'Falta el encabezado Idempotency-Key (de 8 a 100 caracteres: letras, números o guiones)';

/** Compra del cliente (doc conexión §6 "Compra"; CU-02, RF-22..RF-26). */
@Roles('CLIENTE')
@Controller('compras')
export class ComprasController {
  constructor(
    private readonly compras: CompraService,
    private readonly pagar: PagarYEmitirUseCase,
  ) {}

  @Get('resumen')
  resumen(@AccessToken() token: string, @Query() q: ResumenQueryDto) {
    return this.compras.resumen(token, q.cotizacionId, q.primaCotizadaId);
  }

  @Get(':cotizacionId/campos-faltantes')
  camposFaltantes(
    @AccessToken() token: string,
    @Param('cotizacionId', cotizacionValida) cotizacionId: string,
  ) {
    return this.compras.camposFaltantes(token, cotizacionId);
  }

  @Put(':cotizacionId/datos')
  datos(
    @AccessToken() token: string,
    @Param('cotizacionId', cotizacionValida) cotizacionId: string,
    @Body() dto: DatosCompraDto,
  ) {
    return this.compras.guardarDatos(token, cotizacionId, dto);
  }

  @Post()
  crear(@AccessToken() token: string, @Body() dto: CrearCompraDto) {
    return this.compras.crear(token, dto);
  }

  /** 201 { compra, warning? }. Repetir con la misma Idempotency-Key devuelve lo mismo. */
  @Post(':id/pago')
  @HttpCode(HttpStatus.CREATED)
  pago(
    @AccessToken() token: string,
    @Param('id', compraValida) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: PagarDto,
  ) {
    const clave = idempotencyKey?.trim();
    if (!clave || !FORMATO_IDEMPOTENCY_KEY.test(clave)) {
      throw new BadRequestException(FALTA_IDEMPOTENCY_KEY);
    }
    return this.pagar.ejecutar(token, {
      ordenId: id,
      modo: dto.modo,
      numeroCuotas: dto.numeroCuotas,
      idempotencyKey: clave,
    });
  }

  @Get(':id/estado')
  estado(@AccessToken() token: string, @Param('id', compraValida) id: string) {
    return this.compras.estado(token, id);
  }
}
