import { Module } from '@nestjs/common';
import { IntegracionModule } from '../../integracion/integracion.module';
import { PruebaChoqueModule } from '../prueba-choque/prueba-choque.module';
import { AsesoriasService } from './application/asesorias.service';
import { AvisoClienteService } from './application/aviso-cliente.service';
import { GenerarResumenRetencionUseCase } from './application/generar-resumen-retencion.use-case';
import { RetencionJobs } from './application/retencion.jobs';
import { RetomaService } from './application/retoma.service';
import { SeguimientosService } from './application/seguimientos.service';
import { ASESORIA_REPOSITORY } from './domain/asesoria.repository.port';
import { AsesoriaSupabaseRepository } from './infrastructure/asesoria-supabase.repository';
import { AsesoriasController } from './presentation/asesorias.controller';
import { RetomaController } from './presentation/retoma.controller';
import { SeguimientosController } from './presentation/seguimientos.controller';

/** Ola 2: asesoría, seguimiento, descuentos, retoma y jobs (0024/0025); RN-35 en Ola 4 (0037). */
@Module({
  // prueba-choque: la última simulación para el resumen RN-35 del mensaje final.
  imports: [IntegracionModule, PruebaChoqueModule],
  controllers: [AsesoriasController, SeguimientosController, RetomaController],
  providers: [
    { provide: ASESORIA_REPOSITORY, useClass: AsesoriaSupabaseRepository },
    GenerarResumenRetencionUseCase,
    AvisoClienteService,
    AsesoriasService,
    SeguimientosService,
    RetomaService,
    RetencionJobs,
  ],
})
export class AsesoriaRetencionModule {}
