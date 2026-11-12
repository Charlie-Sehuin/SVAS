import { Module } from '@nestjs/common';
import { IntegracionModule } from '../../integracion/integracion.module';
import { ProcesarPagoService } from './application/procesar-pago.service';

/** Ola 3: cobro de la orden (sin controller; lo usa `compra`). */
@Module({
  imports: [IntegracionModule],
  providers: [ProcesarPagoService],
  exports: [ProcesarPagoService],
})
export class PagosModule {}
