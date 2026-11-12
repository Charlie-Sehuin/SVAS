import { Module } from '@nestjs/common';
import { IntegracionModule } from '../../integracion/integracion.module';
import { CotizacionModule } from '../cotizacion/cotizacion.module';
import { PruebaChoqueService } from './application/prueba-choque.service';
import { ResumenSimulacionPdfService } from './application/resumen-pdf.service';
import { PRUEBA_CHOQUE_REPOSITORY } from './domain/prueba-choque.repository.port';
import { PruebaChoqueSupabaseRepository } from './infrastructure/prueba-choque-supabase.repository';
import {
  CotizacionPruebaChoqueController,
  PruebaChoqueController,
} from './presentation/prueba-choque.controller';

/** Ola 2 ★: motor de simulación de siniestros (0026/0027/0028). */
@Module({
  imports: [CotizacionModule, IntegracionModule],
  controllers: [PruebaChoqueController, CotizacionPruebaChoqueController],
  providers: [
    {
      provide: PRUEBA_CHOQUE_REPOSITORY,
      useClass: PruebaChoqueSupabaseRepository,
    },
    PruebaChoqueService,
    ResumenSimulacionPdfService,
  ],
  exports: [PRUEBA_CHOQUE_REPOSITORY],
})
export class PruebaChoqueModule {}
