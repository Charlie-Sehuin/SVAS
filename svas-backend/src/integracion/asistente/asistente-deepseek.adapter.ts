import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { ACCIONES_ASISTENTE } from '../../modules/asistente/domain/asistente';
import type {
  AsistenteConversacional,
  EntradaAsistente,
  RespuestaCruda,
} from '../../modules/asistente/domain/asistente-conversacional.port';
import {
  esErrorPasajero,
  RespuestaInvalidaError,
} from './asistente-gemini.adapter';
import { conReintento } from './reintento';

/** API de DeepSeek (formato compatible con OpenAI Chat Completions). */
export const URL_DEEPSEEK = 'https://api.deepseek.com/chat/completions';

/** Mismo corte por intento que Gemini: dos intentos caben en los 15 s de la API. */
export const TIMEOUT_INTENTO_DEEPSEEK_MS = 6_500;

const MAX_TOKENS_SALIDA = 1_024;

const respuestaSchema = z.object({
  respuesta: z.string(),
  planes: z
    .array(z.object({ clave: z.string(), motivo: z.string() }))
    .default([]),
  acciones: z.array(z.string()).default([]),
});

/** Error HTTP de DeepSeek, con el `status` que mira `esErrorPasajero`. */
export class ErrorDeepSeek extends Error {
  constructor(
    mensaje: string,
    readonly status: number,
  ) {
    super(mensaje);
  }
}

/**
 * DeepSeek no admite un esquema estricto como Gemini: solo "modo JSON". Por eso el formato se pide en las
 * instrucciones (el modo JSON exige que el texto mencione "JSON"). Lo que conteste igual pasa por
 * `validarRespuesta` del dominio, que descarta claves de plan, acciones y montos que no correspondan.
 */
export function instruccionesConFormato(entrada: EntradaAsistente): string {
  const claves = entrada.clavesPlanes.length
    ? entrada.clavesPlanes.join(', ')
    : '(ninguna: deja "planes" vacío)';
  return [
    entrada.instrucciones,
    'Formato de salida: responde SOLO con un objeto JSON válido, sin texto antes ni después, así:',
    '{"respuesta": "texto para la persona", "planes": [{"clave": "P1", "motivo": "una frase"}], "acciones": ["HABLAR_ASESOR"]}',
    `Claves de plan válidas: ${claves}.`,
    `Acciones válidas: ${ACCIONES_ASISTENTE.join(', ')}.`,
  ].join('\n\n');
}

/**
 * Chatbot con DeepSeek. Se usa como respaldo cuando Gemini falla (ver `AsistenteConRespaldoAdapter`) o solo,
 * si no hay clave de Gemini. Sin dependencias nuevas: la API es HTTP y se llama con `fetch`.
 */
@Injectable()
export class AsistenteDeepSeekAdapter implements AsistenteConversacional {
  private readonly logger = new Logger('AsistenteDeepSeek');

  constructor(
    private readonly apiKey: string,
    private readonly modelo: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  /** Como proveedor principal: dos intentos de 6,5 s, igual que Gemini. */
  async responder(entrada: EntradaAsistente): Promise<RespuestaCruda> {
    try {
      return await conReintento(
        () => this.pedir(entrada, TIMEOUT_INTENTO_DEEPSEEK_MS),
        (error) => {
          const reintentar = esErrorPasajero(error);
          if (reintentar)
            this.logger.warn(`Reintentando: ${descripcion(error)}`);
          return reintentar;
        },
      );
    } catch (error) {
      throw this.aExcepcion(error);
    }
  }

  /** Como respaldo: un solo intento con el tiempo que le quede a la petición. */
  async responderUnaVez(
    entrada: EntradaAsistente,
    plazoMs: number,
  ): Promise<RespuestaCruda> {
    try {
      return await this.pedir(entrada, plazoMs);
    } catch (error) {
      throw this.aExcepcion(error);
    }
  }

  private async pedir(
    entrada: EntradaAsistente,
    plazoMs: number,
  ): Promise<RespuestaCruda> {
    const respuesta = await this.fetchFn(URL_DEEPSEEK, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelo,
        messages: [
          { role: 'system', content: instruccionesConFormato(entrada) },
          ...entrada.mensajes.map((m) => ({
            role: m.rol === 'usuario' ? 'user' : 'assistant',
            content: m.texto,
          })),
        ],
        response_format: { type: 'json_object' },
        // Sin razonamiento: en un chat lo vuelve lento y gasta tokens de salida.
        thinking: { type: 'disabled' },
        temperature: 0.3,
        max_tokens: MAX_TOKENS_SALIDA,
        stream: false,
      }),
      signal: AbortSignal.timeout(plazoMs),
    });

    if (!respuesta.ok) {
      const cuerpo = await respuesta.text().catch(() => '');
      throw new ErrorDeepSeek(
        `HTTP ${respuesta.status}: ${cuerpo.slice(0, 300)}`,
        respuesta.status,
      );
    }

    const json = (await respuesta.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const eleccion = json.choices?.[0];
    try {
      return respuestaSchema.parse(
        JSON.parse(eleccion?.message?.content ?? ''),
      );
    } catch (error) {
      throw new RespuestaInvalidaError(
        `respuesta inválida (finish_reason=${eleccion?.finish_reason ?? 'desconocido'}): ${descripcion(error)}`,
      );
    }
  }

  private aExcepcion(error: unknown): Error {
    this.logger.error(`DeepSeek falló: ${descripcion(error)}`);
    const status = (error as { status?: number }).status;
    // 429 = demasiadas peticiones; 402 = la cuenta se quedó sin saldo.
    if (status === 429 || status === 402) {
      return new ServiceUnavailableException(
        'El asistente está muy ocupado en este momento. Intenta en unos minutos.',
      );
    }
    return new BadGatewayException(
      'El asistente no pudo responder, intenta de nuevo',
    );
  }
}

function descripcion(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 400);
}
