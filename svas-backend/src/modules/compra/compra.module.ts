import { Module } from '@nestjs/common';
import { IntegracionModule } from '../../integracion/integracion.module';
import { CotizacionModule } from '../cotizacion/cotizacion.module';
import { PagosModule } from '../pagos/pagos.module';
import { PlanesModule } from '../planes/planes.module';
import { PolizasModule } from '../polizas/polizas.module';
import { CompraService } from './application/compra.service';
import { PagarYEmitirUseCase } from './application/pagar-y-emitir.use-case';
import { COMPRA_REPOSITORY } from './domain/compra.repository.port';
import { CompraSupabaseRepository } from './infrastructure/compra-supabase.repository';
import { ComprasController } from './presentation/compras.controller';

/**
 * Ola 3, tanda 3: cierra la venta. Orquesta planes (copia RN-45), cotización
 * (tarifa), pagos (cobro), pólizas (emisión y PDF) y las RPC 0034/0035.
 */
@Module({
  imports: [
    IntegracionModule,
    CotizacionModule,
    PlanesModule,
    PagosModule,
    PolizasModule,
  ],
  controllers: [ComprasController],
  providers: [
    { provide: COMPRA_REPOSITORY, useClass: CompraSupabaseRepository },
    CompraService,
    PagarYEmitirUseCase,
  ],
})
export class CompraModule {}
