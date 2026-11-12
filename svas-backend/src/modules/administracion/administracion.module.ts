import { Module } from '@nestjs/common';
import { CatalogoAdminService } from './application/catalogo-admin.service';
import { CATALOGO_ADMIN_REPOSITORY } from './domain/catalogo-admin.repository.port';
import { CatalogoAdminSupabaseRepository } from './infrastructure/catalogo-admin-supabase.repository';
import { CatalogoAdminController } from './presentation/catalogo-admin.controller';

/** Ola 0: catálogo, parámetros y bitácora. Las tarifas llegan con 0005/0006. */
@Module({
  controllers: [CatalogoAdminController],
  providers: [
    {
      provide: CATALOGO_ADMIN_REPOSITORY,
      useClass: CatalogoAdminSupabaseRepository,
    },
    CatalogoAdminService,
  ],
})
export class AdministracionModule {}
