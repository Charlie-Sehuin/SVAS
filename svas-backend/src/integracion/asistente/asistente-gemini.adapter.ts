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

/** Menos que el corte general de 15 s (TimeoutInterceptor), para responder con un mensaje propio. */
const TIMEOUT_MS = 12_000;

const respuestaSchema = z.object({
  respuesta: z.string(),
  planes: z
    .array(z.object({ clave: z.string(), motivo: z.string() }))
    .default([]),
  acciones: z.array(z.string()).default([]),
});

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
      httpOptions: { apiVersion: 'v1beta', timeout: TIMEOUT_MS },
    });
  }

  async responder(entrada: EntradaAsistente): Promise<RespuestaCruda> {
    const clave = entrada.clavesPlanes.length
      ? { type: Type.STRING, enum: entrada.clavesPlanes }
      : { type: Type.STRING };
    try {
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
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      });
      return respuestaSchema.parse(JSON.parse(respuesta.text ?? ''));
    } catch (error) {
      this.logger.error(
        `Gemini falló: ${error instanceof Error ? error.message : String(error)}`,
      );
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
}
