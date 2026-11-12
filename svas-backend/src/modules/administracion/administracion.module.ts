import { Module } from '@nestjs/common';
import { IntegracionModule } from '../../integracion/integracion.module';
import { CotizacionModule } from '../cotizacion/cotizacion.module';
import { CatalogoAdminService } from './application/catalogo-admin.service';
import { TarifasAdminService } from './application/tarifas-admin.service';
import { CATALOGO_ADMIN_REPOSITORY } from './domain/catalogo-admin.repository.port';
import { TARIFAS_ADMIN_REPOSITORY } from './domain/tarifas-admin.repository.port';
import { CatalogoAdminSupabaseRepository } from './infrastructure/catalogo-admin-supabase.repository';
import { TarifasAdminSupabaseRepository } from './infrastructure/tarifas-admin-supabase.repository';
import { CatalogoAdminController } from './presentation/catalogo-admin.controller';
import { TarifasAdminController } from './presentation/tarifas-admin.controller';

/** Ola 0: catálogo, parámetros, bitácora y tarifas (las Estrategias validan los parámetros). */
@Module({
  imports: [IntegracionModule, CotizacionModule],
  controllers: [CatalogoAdminController, TarifasAdminController],
  providers: [
    {
      provide: CATALOGO_ADMIN_REPOSITORY,
      useClass: CatalogoAdminSupabaseRepository,
    },
    {
      provide: TARIFAS_ADMIN_REPOSITORY,
      useClass: TarifasAdminSupabaseRepository,
    },
    CatalogoAdminService,
    TarifasAdminService,
  ],
})
export class AdministracionModule {}
