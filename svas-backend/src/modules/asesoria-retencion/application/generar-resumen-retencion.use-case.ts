import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  contrasteRetencion,
  fraseContraste,
} from '../../prueba-choque/domain/contraste';
import {
  PRUEBA_CHOQUE_REPOSITORY,
  type PruebaChoqueRepository,
} from '../../prueba-choque/domain/prueba-choque.repository.port';
import {
  ASESORIA_REPOSITORY,
  type AsesoriaRepository,
} from '../domain/asesoria.repository.port';

/**
 * RN-35 "retención con valor": la frase de mayor contraste de la última
 * Prueba de Choque vigente para el mensaje final, y el registro de si el
 * mensaje la llevó (para el reporte de impacto, §16.7). Nada de esto puede
 * impedir el mensaje: los errores se registran y se sigue sin la frase.
 */
@Injectable()
export class GenerarResumenRetencionUseCase {
  private readonly logger = new Logger(GenerarResumenRetencionUseCase.name);

  constructor(
    @Inject(PRUEBA_CHOQUE_REPOSITORY)
    private readonly simulaciones: PruebaChoqueRepository,
    @Inject(ASESORIA_REPOSITORY) private readonly repo: AsesoriaRepository,
  ) {}

  async frase(cotizacionId: string): Promise<string | null> {
    try {
      const s = await this.simulaciones.ultima(cotizacionId);
      const c = s && contrasteRetencion(s);
      return c ? fraseContraste(c) : null;
    } catch (e) {
      this.logger.warn(
        `Sin resumen RN-35 para la cotización ${cotizacionId}: ${(e as Error).message}`,
      );
      return null;
    }
  }

  async registrarEnvio(seguimientoId: string, incluyeRn35: boolean) {
    try {
      await this.repo.registrarMensajeFinal(seguimientoId, incluyeRn35);
    } catch (e) {
      this.logger.error(
        `No se registró el mensaje final del seguimiento ${seguimientoId}: ${(e as Error).message}`,
      );
    }
  }
}
