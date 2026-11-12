import { Module } from '@nestjs/common';
import { ReportesService } from './application/reportes.service';
import { REPORTES_REPOSITORY } from './domain/reportes.repository.port';
import { ReportesSupabaseRepository } from './infrastructure/reportes-supabase.repository';
import {
  AdminReportesController,
  AsesorReportesController,
} from './presentation/reportes.controller';

/** Ola 4: reportes de solo lectura sobre las RPC de 0036. */
@Module({
  controllers: [AdminReportesController, AsesorReportesController],
  providers: [
    { provide: REPORTES_REPOSITORY, useClass: ReportesSupabaseRepository },
    ReportesService,
  ],
})
export class ReportesModule {}
