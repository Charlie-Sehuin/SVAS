import { Module } from '@nestjs/common';
import { IntegracionModule } from '../../integracion/integracion.module';
import { PlanesModule } from '../planes/planes.module';
import { CalculadoraPrimasService } from './application/calculadora-primas.service';
import { CatalogoPublicoService } from './application/catalogo-publico.service';
import {
  AjustarSumaUseCase,
  CotizarUseCase,
  MisCotizacionesUseCase,
  ObtenerResumenUseCase,
  VincularClienteUseCase,
} from './application/cotizaciones.use-cases';
import { COTIZACION_REPOSITORY } from './domain/cotizacion.repository.port';
import { CotizacionSupabaseRepository } from './infrastructure/cotizacion-supabase.repository';
import { CATALOGO_PUBLICO_REPOSITORY } from './domain/catalogo-publico.port';
import { TARIFA_REPOSITORY } from './domain/tarifa.repository.port';
import { CatalogoPublicoSupabaseRepository } from './infrastructure/catalogo-publico-supabase.repository';
import { TarifaSupabaseRepository } from './infrastructure/tarifa-supabase.repository';
import { LeerTarjetaUseCase } from './application/leer-tarjeta.use-case';
import { ReconocerVehiculoUseCase } from './application/reconocer-vehiculo.use-case';
import { CatalogoController } from './presentation/catalogo.controller';
import { LeerTarjetaController } from './presentation/leer-tarjeta.controller';
import { ReconocerVehiculoController } from './presentation/reconocer-vehiculo.controller';
import { CotizacionAccesoGuard } from './presentation/cotizacion-acceso.guard';
import { CotizacionesController } from './presentation/cotizaciones.controller';

/** Ola 1: catálogo público, cálculo de primas y cotizaciones (0007/0008/0009/0012). */
@Module({
  imports: [IntegracionModule, PlanesModule],
  controllers: [
    CatalogoController,
    ReconocerVehiculoController,
    LeerTarjetaController,
    CotizacionesController,
  ],
  providers: [
    { provide: TARIFA_REPOSITORY, useClass: TarifaSupabaseRepository },
    {
      provide: CATALOGO_PUBLICO_REPOSITORY,
      useClass: CatalogoPublicoSupabaseRepository,
    },
    { provide: COTIZACION_REPOSITORY, useClass: CotizacionSupabaseRepository },
    CatalogoPublicoService,
    ReconocerVehiculoUseCase,
    LeerTarjetaUseCase,
    CalculadoraPrimasService,
    CotizarUseCase,
    ObtenerResumenUseCase,
    AjustarSumaUseCase,
    VincularClienteUseCase,
    MisCotizacionesUseCase,
    CotizacionAccesoGuard,
  ],
  exports: [
    TARIFA_REPOSITORY,
    CATALOGO_PUBLICO_REPOSITORY,
    CalculadoraPrimasService,
    // prueba-choque usa la cotización y el mismo control de acceso (Bearer o X-Cotizacion-Token).
    COTIZACION_REPOSITORY,
    CotizacionAccesoGuard,
    // el asistente (chatbot) lee la cotización ya calculada para citar sus precios.
    ObtenerResumenUseCase,
  ],
})
export class CotizacionModule {}
