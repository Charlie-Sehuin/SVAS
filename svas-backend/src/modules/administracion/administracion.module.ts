import { Module } from '@nestjs/common';
import { IntegracionModule } from '../../integracion/integracion.module';
import { CotizacionModule } from '../cotizacion/cotizacion.module';
import { PlanesModule } from '../planes/planes.module';
import { CatalogoAdminService } from './application/catalogo-admin.service';
import { ContenidoAdminService } from './application/contenido-admin.service';
import { PruebaChoqueAdminService } from './application/prueba-choque-admin.service';
import { TarifasAdminService } from './application/tarifas-admin.service';
import { CATALOGO_ADMIN_REPOSITORY } from './domain/catalogo-admin.repository.port';
import { CONTENIDO_ADMIN_REPOSITORY } from './domain/contenido-admin.repository.port';
import { PRUEBA_CHOQUE_ADMIN_REPOSITORY } from './domain/prueba-choque-admin.repository.port';
import { TARIFAS_ADMIN_REPOSITORY } from './domain/tarifas-admin.repository.port';
import { CatalogoAdminSupabaseRepository } from './infrastructure/catalogo-admin-supabase.repository';
import { ContenidoAdminSupabaseRepository } from './infrastructure/contenido-admin-supabase.repository';
import { PruebaChoqueAdminSupabaseRepository } from './infrastructure/prueba-choque-admin-supabase.repository';
import { TarifasAdminSupabaseRepository } from './infrastructure/tarifas-admin-supabase.repository';
import { CatalogoAdminController } from './presentation/catalogo-admin.controller';
import { ContenidoAdminController } from './presentation/contenido-admin.controller';
import { PruebaChoqueAdminController } from './presentation/prueba-choque-admin.controller';
import { TarifasAdminController } from './presentation/tarifas-admin.controller';

/**
 * Ola 0: catálogo, parámetros, bitácora y tarifas (las Estrategias validan los parámetros).
 * Ola 2 ★: catálogo de la Prueba de Choque (0029) y contenido de los planes (0030).
 */
@Module({
  imports: [IntegracionModule, CotizacionModule, PlanesModule],
  controllers: [
    CatalogoAdminController,
    TarifasAdminController,
    PruebaChoqueAdminController,
    ContenidoAdminController,
  ],
  providers: [
    {
      provide: CATALOGO_ADMIN_REPOSITORY,
      useClass: CatalogoAdminSupabaseRepository,
    },
    {
      provide: TARIFAS_ADMIN_REPOSITORY,
      useClass: TarifasAdminSupabaseRepository,
    },
    {
      provide: PRUEBA_CHOQUE_ADMIN_REPOSITORY,
      useClass: PruebaChoqueAdminSupabaseRepository,
    },
    {
      provide: CONTENIDO_ADMIN_REPOSITORY,
      useClass: ContenidoAdminSupabaseRepository,
    },
    CatalogoAdminService,
    ContenidoAdminService,
    TarifasAdminService,
    PruebaChoqueAdminService,
  ],
})
export class AdministracionModule {}
