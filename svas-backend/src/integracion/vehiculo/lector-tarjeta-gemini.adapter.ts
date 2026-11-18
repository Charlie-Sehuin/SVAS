import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import type {
  ArchivoTarjeta,
  LectorTarjeta,
  TarjetaCruda,
} from '../../modules/cotizacion/domain/lector-tarjeta.port';
import type { OpcionCatalogo } from '../../modules/cotizacion/domain/reconocedor-vehiculo.port';
import { instruccionTarjeta } from './lector-tarjeta-instruccion';

const respuestaSchema = z.object({
  placa: z.string().nullable(),
  marca: z.string().nullable(),
  modelo: z.string().nullable(),
  anio: z.number().int().nullable(),
});

const esquemaGemini = {
  type: Type.OBJECT,
  properties: {
    placa: { type: Type.STRING, nullable: true },
    marca: { type: Type.STRING, nullable: true },
    modelo: { type: Type.STRING, nullable: true },
    anio: { type: Type.INTEGER, nullable: true },
  },
  required: ['placa', 'marca', 'modelo', 'anio'],
};

/**
 * Lector real con Gemini. Lee placa, marca, modelo y año de la tarjeta; marca
 * y modelo solo los elige del catálogo. No se registra el contenido leído.
 */
@Injectable()
export class LectorTarjetaGeminiAdapter implements LectorTarjeta {
  private readonly logger = new Logger('LectorTarjetaGemini');
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly modelo: string,
  ) {
    this.ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1beta' },
    });
  }

  async leer(
    archivo: ArchivoTarjeta,
    catalogo: OpcionCatalogo[],
  ): Promise<TarjetaCruda> {
    const instruccion = instruccionTarjeta(catalogo);

    try {
      const respuesta = await this.ai.models.generateContent({
        model: this.modelo,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: archivo.mimeType,
                  data: archivo.datos.toString('base64'),
                },
              },
              { text: instruccion },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: esquemaGemini,
          temperature: 0,
        },
      });
      return respuestaSchema.parse(JSON.parse(respuesta.text ?? ''));
    } catch (error) {
      // Solo el mensaje de error: nunca el contenido de la tarjeta ni de la respuesta.
      this.logger.error(
        `Gemini falló: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadGatewayException(
        'No se pudo leer la tarjeta, intenta de nuevo',
      );
    }
  }
}
