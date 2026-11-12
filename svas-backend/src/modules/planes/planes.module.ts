import { Module } from '@nestjs/common';
import { PlanesService } from './application/planes.service';
import {
  CONTENIDO_PLAN_REPOSITORY,
  RESUMEN_PLANES,
} from './domain/contenido-plan.repository.port';
import { ContenidoPlanSupabaseRepository } from './infrastructure/contenido-plan-supabase.repository';
import { PlanesController } from './presentation/planes.controller';

/**
 * Ola 2 ★: contenido comercial de los planes, solo lectura (0030/0031).
 * Exporta el repositorio para que el cotizador pinte el `resumen` y el
 * administrador invalide la caché al guardar.
 */
@Module({
  controllers: [PlanesController],
  providers: [
    ContenidoPlanSupabaseRepository,
    {
      provide: CONTENIDO_PLAN_REPOSITORY,
      useExisting: ContenidoPlanSupabaseRepository,
    },
    { provide: RESUMEN_PLANES, useExisting: ContenidoPlanSupabaseRepository },
    PlanesService,
  ],
  exports: [CONTENIDO_PLAN_REPOSITORY, RESUMEN_PLANES],
})
export class PlanesModule {}
