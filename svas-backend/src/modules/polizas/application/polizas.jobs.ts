import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  POLIZAS_REPOSITORY,
  type PolizasRepository,
} from '../domain/polizas.repository.port';
import { EmitirPdfService } from './emitir-pdf.service';

/** Margen para no pisar a la compra que todavía está generando su PDF. */
export const ESPERA_PENDIENTE_MS = 2 * 60 * 1000;
export const LOTE_PENDIENTES = 20;

/**
 * Regenera los PDF que fallaron al comprar (backend §6, paso e: "el job lo
 * regenera"). Repetir es seguro (misma ruta, upsert), así que si dos
 * instancias coinciden solo se hace trabajo de más. Un fallo se registra y
 * se reintenta en la próxima vuelta.
 */
@Injectable()
export class PolizasJobs {
  private readonly logger = new Logger(PolizasJobs.name);
  private corriendo = false;

  constructor(
    @Inject(POLIZAS_REPOSITORY) private readonly repo: PolizasRepository,
    private readonly emitir: EmitirPdfService,
  ) {}

  @Cron('*/5 * * * *', { name: 'regenerar-pdf-pendiente' })
  async regenerarPendientes(
    ahora: Date = new Date(),
  ): Promise<{ generados: number; fallidos: number }> {
    if (this.corriendo) return { generados: 0, fallidos: 0 };
    this.corriendo = true;
    let generados = 0;
    let fallidos = 0;
    try {
      const ids = await this.repo.pendientes(
        new Date(ahora.getTime() - ESPERA_PENDIENTE_MS),
        LOTE_PENDIENTES,
      );
      for (const id of ids) {
        try {
          await this.emitir.generar(id);
          generados++;
        } catch (e) {
          fallidos++;
          this.logger.error(
            `PDF de la póliza ${id} falló: ${(e as Error).message}`,
          );
        }
      }
      if (ids.length > 0) {
        this.logger.log(
          `PDF pendientes: ${generados} generado(s), ${fallidos} fallido(s)`,
        );
      }
    } catch (e) {
      this.logger.error(
        `Regenerar PDF pendientes falló: ${(e as Error).message}`,
      );
    } finally {
      this.corriendo = false;
    }
    return { generados, fallidos };
  }
}
