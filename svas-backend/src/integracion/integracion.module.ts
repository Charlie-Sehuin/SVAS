import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation';
import { NOTIFICADOR_MENSAJES } from '../modules/asesoria-retencion/domain/notificador-mensajes.port';
import { REGISTRO_ESTRATEGIAS } from '../modules/cotizacion/domain/estrategia-cotizacion.port';
import { PASARELA_PAGO } from '../modules/pagos/domain/pasarela-pago.port';
import { EMISION_ASEGURADORA } from '../modules/polizas/domain/emision-aseguradora.port';
import { GENERADOR_PDF } from '../modules/polizas/domain/generador-pdf.port';
import { CLASIFICADOR_PREOCUPACIONES } from '../modules/prueba-choque/domain/clasificador-preocupaciones.port';
import { ClasificadorLlmAdapter } from './clasificador/clasificador-llm.adapter';
import { ClasificadorPalabrasClaveAdapter } from './clasificador/clasificador-palabras-clave.adapter';
import { AseguradoraSimuladaAdapter } from './emision/aseguradora-simulada.adapter';
import { EstrategiaRegistry } from './estrategias/estrategia.registry';
import { NotificadorSimuladoAdapter } from './mensajes/notificador-simulado.adapter';
import { RECONOCEDOR_VEHICULO } from '../modules/cotizacion/domain/reconocedor-vehiculo.port';
import { PasarelaSimuladaAdapter } from './pagos/pasarela-simulada.adapter';
import { ReconocedorGeminiAdapter } from './vehiculo/reconocedor-gemini.adapter';
import { ReconocedorSimuladoAdapter } from './vehiculo/reconocedor-simulado.adapter';
import { PdfkitGeneradorAdapter } from './pdf/pdfkit-generador.adapter';

/**
 * Une cada puerto (token del dominio) con su adaptador. Los módulos de negocio
 * importan este módulo e inyectan por token: `@Inject(PASARELA_PAGO)`.
 * Cambiar la pasarela simulada por una real = cambiar una línea aquí.
 */
@Module({
  providers: [
    {
      provide: REGISTRO_ESTRATEGIAS,
      useFactory: () => new EstrategiaRegistry(),
    },
    { provide: PASARELA_PAGO, useClass: PasarelaSimuladaAdapter },
    { provide: EMISION_ASEGURADORA, useClass: AseguradoraSimuladaAdapter },
    { provide: GENERADOR_PDF, useClass: PdfkitGeneradorAdapter },
    { provide: NOTIFICADOR_MENSAJES, useClass: NotificadorSimuladoAdapter },
    {
      provide: CLASIFICADOR_PREOCUPACIONES,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('FEATURE_CLASIFICADOR_LLM', { infer: true })
          ? new ClasificadorLlmAdapter()
          : new ClasificadorPalabrasClaveAdapter(),
    },
    {
      // Con GEMINI_API_KEY se usa Gemini; sin ella, el simulado (en producción avisa 503).
      provide: RECONOCEDOR_VEHICULO,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const logger = new Logger('IntegracionModule');
        const apiKey = config.get('GEMINI_API_KEY', { infer: true });
        if (apiKey) {
          return new ReconocedorGeminiAdapter(
            apiKey,
            config.get('GEMINI_MODEL', { infer: true }),
          );
        }
        const enProduccion =
          config.get('NODE_ENV', { infer: true }) === 'production';
        logger.warn(
          enProduccion
            ? 'GEMINI_API_KEY no está definida: el reconocimiento por foto responderá 503'
            : 'GEMINI_API_KEY no está definida: reconocimiento por foto SIMULADO',
        );
        return new ReconocedorSimuladoAdapter(enProduccion);
      },
    },
  ],
  exports: [
    RECONOCEDOR_VEHICULO,
    REGISTRO_ESTRATEGIAS,
    PASARELA_PAGO,
    EMISION_ASEGURADORA,
    GENERADOR_PDF,
    NOTIFICADOR_MENSAJES,
    CLASIFICADOR_PREOCUPACIONES,
  ],
})
export class IntegracionModule {}
