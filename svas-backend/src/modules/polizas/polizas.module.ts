import { Module } from '@nestjs/common';
import { IntegracionModule } from '../../integracion/integracion.module';
import { EmitirPdfService } from './application/emitir-pdf.service';
import { PolizasJobs } from './application/polizas.jobs';
import { PolizasService } from './application/polizas.service';
import { POLIZAS_REPOSITORY } from './domain/polizas.repository.port';
import { PolizasSupabaseRepository } from './infrastructure/polizas-supabase.repository';
import { PolizasController } from './presentation/polizas.controller';

/** Ola 3: emisión simulada, PDF en Storage, descarga y regeneración (0033 + bucket 0019). */
@Module({
  imports: [IntegracionModule],
  controllers: [PolizasController],
  providers: [
    { provide: POLIZAS_REPOSITORY, useClass: PolizasSupabaseRepository },
    EmitirPdfService,
    PolizasService,
    PolizasJobs,
  ],
  exports: [EmitirPdfService],
})
export class PolizasModule {}
