import { Injectable, Logger } from '@nestjs/common';
import { TIMEOUT_MS } from '../../common/interceptors/timeout.interceptor';
import type {
  AsistenteConversacional,
  EntradaAsistente,
  RespuestaCruda,
} from '../../modules/asistente/domain/asistente-conversacional.port';

/** Lo que necesita el proveedor de respaldo: un intento con un plazo dado. */
export interface AsistenteRespaldo {
  responderUnaVez(
    entrada: EntradaAsistente,
    plazoMs: number,
  ): Promise<RespuestaCruda>;
}

/** Tiempo total de un turno: el corte de la API (15 s) menos un margen para armar la respuesta. */
export const PRESUPUESTO_MS = TIMEOUT_MS - 1_000;
/** Con menos de esto no vale la pena intentar el respaldo: no alcanzaría a responder. */
export const PLAZO_MINIMO_RESPALDO_MS = 3_000;
/** Tope para el respaldo aunque quede más tiempo. */
export const PLAZO_MAXIMO_RESPALDO_MS = 8_000;

/**
 * Plan B del chatbot (idea de Charlie): si el proveedor principal (Gemini) falla, se intenta una vez con el
 * respaldo (DeepSeek) dentro del tiempo que le quede a la petición. Si el respaldo también falla, se devuelve
 * el error del principal, que es el que la persona ya conoce ("muy ocupado" o "no pudo responder").
 *
 * Límite: si Gemini agota sus dos intentos por tiempo (2 × 6,5 s), no queda tiempo para el respaldo. Donde más
 * ayuda es en los fallos rápidos: cuota agotada (429), 5xx o respuesta cortada.
 */
@Injectable()
export class AsistenteConRespaldoAdapter implements AsistenteConversacional {
  private readonly logger = new Logger('AsistenteConRespaldo');

  constructor(
    private readonly principal: AsistenteConversacional,
    private readonly respaldo: AsistenteRespaldo,
    private readonly ahora: () => number = Date.now,
  ) {}

  async responder(entrada: EntradaAsistente): Promise<RespuestaCruda> {
    const inicio = this.ahora();
    try {
      return await this.principal.responder(entrada);
    } catch (errorPrincipal) {
      const restante = PRESUPUESTO_MS - (this.ahora() - inicio);
      if (restante < PLAZO_MINIMO_RESPALDO_MS) {
        this.logger.warn(
          `El principal falló y quedan ${restante} ms: no se intenta el respaldo`,
        );
        throw errorPrincipal;
      }
      this.logger.warn('El principal falló: se intenta con el respaldo');
      try {
        return await this.respaldo.responderUnaVez(
          entrada,
          Math.min(restante, PLAZO_MAXIMO_RESPALDO_MS),
        );
      } catch {
        // El respaldo ya dejó su propio registro del fallo.
        throw errorPrincipal;
      }
    }
  }
}
