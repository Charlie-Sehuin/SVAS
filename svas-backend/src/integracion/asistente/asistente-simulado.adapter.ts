import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  AsistenteConversacional,
  EntradaAsistente,
  RespuestaCruda,
} from '../../modules/asistente/domain/asistente-conversacional.port';

/**
 * Chatbot simulado: se usa mientras no haya GEMINI_API_KEY. No entiende el
 * mensaje: contesta un texto fijo y "recomienda" el primer plan para poder
 * probar el flujo. En producción no finge: avisa que no está disponible.
 */
@Injectable()
export class AsistenteSimuladoAdapter implements AsistenteConversacional {
  constructor(private readonly enProduccion: boolean) {}

  responder(entrada: EntradaAsistente): Promise<RespuestaCruda> {
    if (this.enProduccion) {
      return Promise.reject(
        new ServiceUnavailableException(
          'El asistente no está disponible por ahora',
        ),
      );
    }
    const clave = entrada.clavesPlanes[0];
    return Promise.resolve({
      respuesta:
        'Soy el asistente en modo de prueba (sin IA conectada). Con la clave de Gemini te respondería de verdad.',
      planes: clave
        ? [{ clave, motivo: 'Plan de ejemplo del modo de prueba.' }]
        : [],
      acciones: ['HABLAR_ASESOR'],
    });
  }
}
