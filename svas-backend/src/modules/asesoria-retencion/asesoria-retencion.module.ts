import { Module } from '@nestjs/common';
import { IntegracionModule } from '../../integracion/integracion.module';
import { AsesoriasService } from './application/asesorias.service';
import { AvisoClienteService } from './application/aviso-cliente.service';
import { RetencionJobs } from './application/retencion.jobs';
import { RetomaService } from './application/retoma.service';
import { SeguimientosService } from './application/seguimientos.service';
import { ASESORIA_REPOSITORY } from './domain/asesoria.repository.port';
import { AsesoriaSupabaseRepository } from './infrastructure/asesoria-supabase.repository';
import { AsesoriasController } from './presentation/asesorias.controller';
import { RetomaController } from './presentation/retoma.controller';
import { SeguimientosController } from './presentation/seguimientos.controller';

/** Ola 2: asesoría, seguimiento, descuentos, retoma y jobs (0024/0025). */
@Module({
  imports: [IntegracionModule],
  controllers: [AsesoriasController, SeguimientosController, RetomaController],
  providers: [
    { provide: ASESORIA_REPOSITORY, useClass: AsesoriaSupabaseRepository },
    AvisoClienteService,
    AsesoriasService,
    SeguimientosService,
    RetomaService,
    RetencionJobs,
  ],
})
export class AsesoriaRetencionModule {}
