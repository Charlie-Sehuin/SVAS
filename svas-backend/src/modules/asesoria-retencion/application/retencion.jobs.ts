import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  ASESORIA_REPOSITORY,
  type AsesoriaRepository,
} from '../domain/asesoria.repository.port';
import { AvisoClienteService } from './aviso-cliente.service';

const ZONA = 'America/Lima';

/**
 * Procesos automáticos (contexto §11, backend §3.6.4). El lock para que dos
 * instancias no corran a la vez está DENTRO de cada RPC
 * (pg_try_advisory_xact_lock): si otra instancia lo tiene, el RPC sale sin hacer nada.
 * Un fallo se registra y no tumba la app; el próximo disparo lo reintenta.
 */
@Injectable()
export class RetencionJobs {
  private readonly logger = new Logger(RetencionJobs.name);

  constructor(
    @Inject(ASESORIA_REPOSITORY) private readonly repo: AsesoriaRepository,
    private readonly aviso: AvisoClienteService,
  ) {}

  /** Cada hora: REGISTRADA sin solicitud abierta y vieja → seguimiento (RPC 6.10). */
  @Cron('0 * * * *', { name: 'detector-abandono', timeZone: ZONA })
  async detectarAbandono(): Promise<number> {
    try {
      const abiertos = await this.repo.detectarAbandonadas();
      if (abiertos > 0)
        this.logger.log(`Detector: ${abiertos} seguimiento(s) abierto(s)`);
      return abiertos;
    } catch (e) {
      this.logger.error(`Detector de abandono falló: ${(e as Error).message}`);
      return 0;
    }
  }

  /** Cada día 8:00 (Lima): cierra los vencidos y envía el mensaje final. */
  @Cron('0 8 * * *', { name: 'caducidad-seguimiento', timeZone: ZONA })
  async caducarSeguimientos(): Promise<{
    cerrados: number;
    sinMensaje: number;
  }> {
    try {
      const cierres = await this.repo.caducarSeguimientos();
      let sinMensaje = 0;
      for (const cierre of cierres) {
        if (await this.aviso.enviar(cierre, 'MENSAJE_FINAL')) sinMensaje++;
      }
      if (cierres.length > 0) {
        this.logger.log(
          `Caducidad: ${cierres.length} seguimiento(s) cerrado(s), ${sinMensaje} sin mensaje`,
        );
      }
      return { cerrados: cierres.length, sinMensaje };
    } catch (e) {
      this.logger.error(
        `Caducidad de seguimientos falló: ${(e as Error).message}`,
      );
      return { cerrados: 0, sinMensaje: 0 };
    }
  }
}
