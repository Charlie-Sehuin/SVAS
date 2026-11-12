import { Module } from '@nestjs/common';
import { IntegracionModule } from '../../integracion/integracion.module';
import { CalculadoraPrimasService } from './application/calculadora-primas.service';
import { CatalogoPublicoService } from './application/catalogo-publico.service';
import { CATALOGO_PUBLICO_REPOSITORY } from './domain/catalogo-publico.port';
import { TARIFA_REPOSITORY } from './domain/tarifa.repository.port';
import { CatalogoPublicoSupabaseRepository } from './infrastructure/catalogo-publico-supabase.repository';
import { TarifaSupabaseRepository } from './infrastructure/tarifa-supabase.repository';
import { CatalogoController } from './presentation/catalogo.controller';

/** Ola 1: catálogo público + cálculo de primas. POST /cotizaciones llega con 0007/0008/0012. */
@Module({
  imports: [IntegracionModule],
  controllers: [CatalogoController],
  providers: [
    { provide: TARIFA_REPOSITORY, useClass: TarifaSupabaseRepository },
    {
      provide: CATALOGO_PUBLICO_REPOSITORY,
      useClass: CatalogoPublicoSupabaseRepository,
    },
    CatalogoPublicoService,
    CalculadoraPrimasService,
  ],
  exports: [
    TARIFA_REPOSITORY,
    CATALOGO_PUBLICO_REPOSITORY,
    CalculadoraPrimasService,
  ],
})
export class CotizacionModule {}
