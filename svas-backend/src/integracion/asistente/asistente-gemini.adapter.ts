import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { ACCIONES_ASISTENTE } from '../../modules/asistente/domain/asistente';
import type {
  AsistenteConversacional,
  EntradaAsistente,
  RespuestaCruda,
} from '../../modules/asistente/domain/asistente-conversacional.port';
import { conReintento } from './reintento';

/**
 * Por intento, cortado de nuestro lado con AbortSignal. (No se usa `httpOptions.timeout`: Gemini lo toma como un plazo
 * del servidor y rechaza los menores de 10 s.) Se permiten dos intentos y el corte general de la API es de 15 s
 * (TimeoutInterceptor), así que dos intentos de 6,5 s caben justos.
 */
const TIMEOUT_INTENTO_MS = 6_500;

/**
 * Tope de salida. Los modelos "con razonamiento" gastan parte de este tope pensando: con 1 024 el JSON podía salir
 * cortado y fallar al leerlo (en producción fallaban 5 de cada 6 intentos).
 */
const MAX_TOKENS_SALIDA = 4_096;

const respuestaSchema = z.object({
  respuesta: z.string(),
  planes: z
    .array(z.object({ clave: z.string(), motivo: z.string() }))
    .default([]),
  acciones: z.array(z.string()).default([]),
});

/** La respuesta de Gemini llegó vacía, cortada o fuera del formato pedido. */
export class RespuestaInvalidaError extends Error {}

/** Errores pasajeros que valen un segundo intento. La cuota agotada (429) no: reintentar no sirve. */
export function esErrorPasajero(error: unknown): boolean {
  if (error instanceof RespuestaInvalidaError) return true;
  const e = error as { status?: number; name?: string };
  if (typeof e.status === 'number')
    return [500, 502, 503, 504].includes(e.status);
  return e.name === 'AbortError' || e.name === 'TimeoutError';
}

/**
 * `gemini-2.5-flash` piensa por defecto y eso lo vuelve lento y variable para un chat: se apaga el razonamiento.
 * Los modelos más nuevos usan otro mecanismo y se dejan como vienen. (`2.5-pro` no admite apagarlo.)
 */
export function configRazonamiento(modelo: string) {
  return /gemini-2\.5-flash/.test(modelo)
    ? { thinkingConfig: { thinkingBudget: 0 } }
    : {};
}

/** Chatbot real con Gemini (SDK oficial). Solo puede citar las claves de plan que recibe. */
@Injectable()
export class AsistenteGeminiAdapter implements AsistenteConversacional {
  private readonly logger = new Logger('AsistenteGemini');
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly modelo: string,
  ) {
    // La salida JSON con esquema solo está habilitada en v1beta.
    this.ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1beta' },
    });
  }

  async responder(entrada: EntradaAsistente): Promise<RespuestaCruda> {
    try {
      return await conReintento(
        () => this.pedir(entrada),
        (error) => {
          const reintentar = esErrorPasajero(error);
          if (reintentar)
            this.logger.warn(`Reintentando: ${descripcion(error)}`);
          return reintentar;
        },
      );
    } catch (error) {
      this.logger.error(`Gemini falló: ${descripcion(error)}`);
      // 429 = se acabó la cuota (gratuita) de Gemini por ahora.
      if ((error as { status?: number }).status === 429) {
        throw new ServiceUnavailableException(
          'El asistente está muy ocupado en este momento. Intenta en unos minutos.',
        );
      }
      throw new BadGatewayException(
        'El asistente no pudo responder, intenta de nuevo',
      );
    }
  }

  private async pedir(entrada: EntradaAsistente): Promise<RespuestaCruda> {
    const clave = entrada.clavesPlanes.length
      ? { type: Type.STRING, enum: entrada.clavesPlanes }
      : { type: Type.STRING };
    const respuesta = await this.ai.models.generateContent({
      model: this.modelo,
      contents: entrada.mensajes.map((m) => ({
        role: m.rol === 'usuario' ? 'user' : 'model',
        parts: [{ text: m.texto }],
      })),
      config: {
        systemInstruction: entrada.instrucciones,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            respuesta: { type: Type.STRING },
            planes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { clave, motivo: { type: Type.STRING } },
                required: ['clave', 'motivo'],
              },
            },
            acciones: {
              type: Type.ARRAY,
              items: { type: Type.STRING, enum: [...ACCIONES_ASISTENTE] },
            },
          },
          required: ['respuesta', 'planes', 'acciones'],
        },
        abortSignal: AbortSignal.timeout(TIMEOUT_INTENTO_MS),
        temperature: 0.3,
        maxOutputTokens: MAX_TOKENS_SALIDA,
        ...configRazonamiento(this.modelo),
      },
    });

    const motivo = respuesta.candidates?.[0]?.finishReason;
    try {
      return respuestaSchema.parse(JSON.parse(respuesta.text ?? ''));
    } catch (error) {
      // Queda en el registro por qué se cortó (p. ej. MAX_TOKENS) para poder diagnosticarlo sin adivinar.
      throw new RespuestaInvalidaError(
        `respuesta inválida (finishReason=${motivo ?? 'desconocido'}): ${descripcion(error)}`,
      );
    }
  }
}

function descripcion(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 400);
}
