import { Module } from '@nestjs/common';
import { ArmarCopiaContenidoService } from './application/armar-copia-contenido.service';
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
    ArmarCopiaContenidoService,
  ],
  exports: [
    CONTENIDO_PLAN_REPOSITORY,
    RESUMEN_PLANES,
    // compra congela el contenido del plan en la orden (RN-45).
    ArmarCopiaContenidoService,
  ],
})
export class PlanesModule {}
