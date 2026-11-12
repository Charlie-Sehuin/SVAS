import { Module } from '@nestjs/common';
import { CotizacionModule } from '../cotizacion/cotizacion.module';
import { PruebaChoqueService } from './application/prueba-choque.service';
import { PRUEBA_CHOQUE_REPOSITORY } from './domain/prueba-choque.repository.port';
import { PruebaChoqueSupabaseRepository } from './infrastructure/prueba-choque-supabase.repository';
import {
  CotizacionPruebaChoqueController,
  PruebaChoqueController,
} from './presentation/prueba-choque.controller';

/** Ola 2 ★: motor de simulación de siniestros (0026/0027/0028). */
@Module({
  imports: [CotizacionModule],
  controllers: [PruebaChoqueController, CotizacionPruebaChoqueController],
  providers: [
    {
      provide: PRUEBA_CHOQUE_REPOSITORY,
      useClass: PruebaChoqueSupabaseRepository,
    },
    PruebaChoqueService,
  ],
  exports: [PRUEBA_CHOQUE_REPOSITORY],
})
export class PruebaChoqueModule {}
