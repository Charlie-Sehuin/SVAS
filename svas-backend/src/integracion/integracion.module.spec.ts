import { Logger, NotImplementedException } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import Decimal from 'decimal.js';
import type { Env } from '../config/env.validation';
import { NOTIFICADOR_MENSAJES } from '../modules/asesoria-retencion/domain/notificador-mensajes.port';
import {
  CODIGOS_ESTRATEGIA,
  REGISTRO_ESTRATEGIAS,
  type RegistroEstrategias,
} from '../modules/cotizacion/domain/estrategia-cotizacion.port';
import {
  PASARELA_PAGO,
  type PasarelaPago,
} from '../modules/pagos/domain/pasarela-pago.port';
import {
  EMISION_ASEGURADORA,
  type EmisionAseguradora,
} from '../modules/polizas/domain/emision-aseguradora.port';
import {
  GENERADOR_PDF,
  type GeneradorPdf,
} from '../modules/polizas/domain/generador-pdf.port';
import {
  CLASIFICADOR_PREOCUPACIONES,
  type ClasificadorPreocupaciones,
} from '../modules/prueba-choque/domain/clasificador-preocupaciones.port';
import { ClasificadorLlmAdapter } from './clasificador/clasificador-llm.adapter';
import { ClasificadorPalabrasClaveAdapter } from './clasificador/clasificador-palabras-clave.adapter';
import { IntegracionModule } from './integracion.module';
import {
  NotificadorSimuladoAdapter,
  ocultarEnlaces,
} from './mensajes/notificador-simulado.adapter';

async function compilar(env: Record<string, string> = {}) {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({ FEATURE_CLASIFICADOR_LLM: false, ...env })],
      }),
      IntegracionModule,
    ],
  }).compile();
}

describe('IntegracionModule', () => {
  it('resuelve los 6 puertos', async () => {
    const m = await compilar();
    for (const token of [
      REGISTRO_ESTRATEGIAS,
      PASARELA_PAGO,
      EMISION_ASEGURADORA,
      GENERADOR_PDF,
      NOTIFICADOR_MENSAJES,
      CLASIFICADOR_PREOCUPACIONES,
    ]) {
      expect(m.get(token)).toBeDefined();
    }
  });

  it('el registro tiene las 5 estrategias y falla con un código desconocido', async () => {
    const registro = (await compilar()).get<RegistroEstrategias>(
      REGISTRO_ESTRATEGIAS,
    );
    expect(
      registro
        .todas()
        .map((e) => e.codigo)
        .sort(),
    ).toEqual([...CODIGOS_ESTRATEGIA].sort());
    expect(registro.obtener('MAPFRE').codigo).toBe('MAPFRE');
    expect(() => registro.obtener('INEXISTENTE')).toThrow(/INEXISTENTE/);
  });

  it('los adaptadores aún no implementados lanzan NotImplementedException', async () => {
    const m = await compilar();
    const llamadas: Array<() => unknown> = [
      () =>
        m.get<PasarelaPago>(PASARELA_PAGO).cobrar({
          ordenId: 'o',
          monto: new Decimal(1),
          modo: 'UNICO',
          idempotencyKey: 'k',
        }),
      () =>
        m
          .get<EmisionAseguradora>(EMISION_ASEGURADORA)
          .emitir({ codigoEstrategia: 'RIMAC', ordenId: 'o' }),
      () =>
        m
          .get<GeneradorPdf>(GENERADOR_PDF)
          .generarPoliza({ polizaId: 'p', numeroPoliza: 'n', datos: {} }),
      () =>
        m
          .get<ClasificadorPreocupaciones>(CLASIFICADOR_PREOCUPACIONES)
          .clasificar('texto'),
    ];
    for (const llamar of llamadas) {
      expect(llamar).toThrow(NotImplementedException);
    }
  });

  describe('NotificadorSimulado', () => {
    const texto = 'Hola Ana, retoma aquí: http://x/retoma/AbC-12_xyz';
    const enviar = async (nodeEnv: string) => {
      const log = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      const config = { get: () => nodeEnv } as unknown as ConfigService<
        Env,
        true
      >;
      const r = await new NotificadorSimuladoAdapter(config).enviar({
        canal: 'WHATSAPP',
        destinatario: '987654321',
        texto,
      });
      const linea = String(log.mock.calls[0]?.[0]);
      log.mockRestore();
      return { r, linea };
    };

    it('no envía: registra con el teléfono enmascarado y devuelve una referencia', async () => {
      const { r, linea } = await enviar('development');
      expect(r.enviado).toBe(true);
      expect(r.referencia).toMatch(/^SIM-/);
      expect(linea).toContain('****4321');
      expect(linea).not.toContain('987654321');
      expect(linea).toContain('/retoma/AbC-12_xyz');
    });

    it('en producción oculta el token del enlace', async () => {
      const { linea } = await enviar('production');
      expect(linea).toContain('/retoma/***');
      expect(linea).not.toContain('AbC-12_xyz');
    });

    it('ocultarEnlaces no toca el resto del texto', () => {
      expect(ocultarEnlaces(texto)).toBe(
        'Hola Ana, retoma aquí: http://x/retoma/***',
      );
    });
  });

  it('usa el clasificador por palabras clave por defecto y el LLM solo con el flag', async () => {
    expect((await compilar()).get(CLASIFICADOR_PREOCUPACIONES)).toBeInstanceOf(
      ClasificadorPalabrasClaveAdapter,
    );
    const conFlag = await compilar({ FEATURE_CLASIFICADOR_LLM: true } as never);
    expect(conFlag.get(CLASIFICADOR_PREOCUPACIONES)).toBeInstanceOf(
      ClasificadorLlmAdapter,
    );
  });
});
