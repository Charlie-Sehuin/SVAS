import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { z } from 'zod';
import type {
  ArchivoTarjeta,
  LectorTarjeta,
  TarjetaCruda,
} from '../../modules/cotizacion/domain/lector-tarjeta.port';
import type { OpcionCatalogo } from '../../modules/cotizacion/domain/reconocedor-vehiculo.port';
import { URL_DEEPSEEK } from '../asistente/asistente-deepseek.adapter';
import {
  FORMATO_JSON_TARJETA,
  instruccionTarjeta,
} from './lector-tarjeta-instruccion';

/** Deja tiempo para el respaldo: la API corta a los 15 s. */
export const TIMEOUT_LECTOR_DEEPSEEK_MS = 7_000;

const MAX_TOKENS_SALIDA = 200;
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];

const respuestaSchema = z.object({
  placa: z.string().nullable(),
  marca: z.string().nullable(),
  modelo: z.string().nullable(),
  anio: z.number().int().nullable(),
});

/**
 * Lector de tarjetas con DeepSeek (modelo con visión, p. ej. `deepseek-flash`). Solo lee imágenes: un PDF
 * se rechaza sin llamar a la API (con respaldo, lo lee Gemini). No se registra el contenido leído.
 */
@Injectable()
export class LectorTarjetaDeepSeekAdapter implements LectorTarjeta {
  private readonly logger = new Logger('LectorTarjetaDeepSeek');

  constructor(
    private readonly apiKey: string,
    private readonly modelo: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async leer(
    archivo: ArchivoTarjeta,
    catalogo: OpcionCatalogo[],
  ): Promise<TarjetaCruda> {
    if (!TIPOS_IMAGEN.includes(archivo.mimeType)) {
      throw new BadRequestException(
        'Por ahora la tarjeta debe ser una foto (JPG, PNG o WEBP), no un PDF.',
      );
    }
    try {
      const respuesta = await this.fetchFn(URL_DEEPSEEK, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelo,
          messages: [
            {
              role: 'system',
              content: `${instruccionTarjeta(catalogo)}\n\n${FORMATO_JSON_TARJETA}`,
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Lee la tarjeta y responde en JSON.' },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${archivo.mimeType};base64,${archivo.datos.toString('base64')}`,
                  },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          // Sin razonamiento: leer cuatro datos no lo necesita y gasta tokens de salida.
          thinking: { type: 'disabled' },
          temperature: 0,
          max_tokens: MAX_TOKENS_SALIDA,
          stream: false,
        }),
        signal: AbortSignal.timeout(TIMEOUT_LECTOR_DEEPSEEK_MS),
      });
      if (!respuesta.ok) {
        // Solo el estado: el cuerpo podría repetir lo enviado.
        throw new Error(`HTTP ${respuesta.status}`);
      }
      const json = (await respuesta.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      // En modo JSON, DeepSeek puede devolver solo espacios: falla aquí y se pasa al respaldo.
      return respuestaSchema.parse(
        JSON.parse(json.choices?.[0]?.message?.content ?? ''),
      );
    } catch (error) {
      // Nunca el contenido de la tarjeta ni de la respuesta.
      this.logger.error(
        `DeepSeek falló: ${error instanceof Error ? error.message.slice(0, 200) : 'error desconocido'}`,
      );
      throw new BadGatewayException(
        'No se pudo leer la tarjeta, intenta de nuevo',
      );
    }
  }
}
