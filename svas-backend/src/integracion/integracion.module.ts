import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation';
import { ASISTENTE_CONVERSACIONAL } from '../modules/asistente/domain/asistente-conversacional.port';
import { NOTIFICADOR_MENSAJES } from '../modules/asesoria-retencion/domain/notificador-mensajes.port';
import { REGISTRO_ESTRATEGIAS } from '../modules/cotizacion/domain/estrategia-cotizacion.port';
import { PASARELA_PAGO } from '../modules/pagos/domain/pasarela-pago.port';
import { EMISION_ASEGURADORA } from '../modules/polizas/domain/emision-aseguradora.port';
import { ENVIADOR_CORREO } from '../modules/polizas/domain/enviador-correo.port';
import { GENERADOR_PDF } from '../modules/polizas/domain/generador-pdf.port';
import { CLASIFICADOR_PREOCUPACIONES } from '../modules/prueba-choque/domain/clasificador-preocupaciones.port';
import { AsistenteGeminiAdapter } from './asistente/asistente-gemini.adapter';
import { AsistenteSimuladoAdapter } from './asistente/asistente-simulado.adapter';
import { ClasificadorLlmAdapter } from './clasificador/clasificador-llm.adapter';
import { ClasificadorPalabrasClaveAdapter } from './clasificador/clasificador-palabras-clave.adapter';
import { EnviadorCorreoResendAdapter } from './correo/enviador-correo-resend.adapter';
import { EnviadorCorreoSimuladoAdapter } from './correo/enviador-correo-simulado.adapter';
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
      // Con RESEND_API_KEY el PDF de la póliza se manda de verdad por correo; sin ella, el simulado (solo registra).
      provide: ENVIADOR_CORREO,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const apiKey = config.get('RESEND_API_KEY', { infer: true });
        if (apiKey) {
          return new EnviadorCorreoResendAdapter(
            apiKey,
            config.get('CORREO_REMITENTE', { infer: true }),
          );
        }
        new Logger('IntegracionModule').warn(
          'RESEND_API_KEY no está definida: los correos (PDF de la póliza) son SIMULADOS',
        );
        return new EnviadorCorreoSimuladoAdapter();
      },
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
    {
      // El chatbot usa la misma clave de Gemini; sin ella, el simulado (en producción avisa 503).
      provide: ASISTENTE_CONVERSACIONAL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const apiKey = config.get('GEMINI_API_KEY', { infer: true });
        if (apiKey) {
          return new AsistenteGeminiAdapter(
            apiKey,
            config.get('GEMINI_MODEL', { infer: true }),
          );
        }
        const enProduccion =
          config.get('NODE_ENV', { infer: true }) === 'production';
        new Logger('IntegracionModule').warn(
          enProduccion
            ? 'GEMINI_API_KEY no está definida: el chatbot responderá 503'
            : 'GEMINI_API_KEY no está definida: chatbot SIMULADO',
        );
        return new AsistenteSimuladoAdapter(enProduccion);
      },
    },
  ],
  exports: [
    ASISTENTE_CONVERSACIONAL,
    RECONOCEDOR_VEHICULO,
    REGISTRO_ESTRATEGIAS,
    PASARELA_PAGO,
    EMISION_ASEGURADORA,
    GENERADOR_PDF,
    ENVIADOR_CORREO,
    NOTIFICADOR_MENSAJES,
    CLASIFICADOR_PREOCUPACIONES,
  ],
})
export class IntegracionModule {}
