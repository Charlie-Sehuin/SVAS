import { NotImplementedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import Decimal from 'decimal.js';
import {
  NOTIFICADOR_MENSAJES,
  type NotificadorMensajes,
} from '../modules/asesoria-retencion/domain/notificador-mensajes.port';
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
        m
          .get<RegistroEstrategias>(REGISTRO_ESTRATEGIAS)
          .obtener('RIMAC')
          .totalEnCuotas(new Decimal(1), {
            planId: 'p',
            nombre: 'Oro',
            tasaBase: new Decimal(0),
            parametros: {},
          }),
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
          .get<NotificadorMensajes>(NOTIFICADOR_MENSAJES)
          .enviar({ canal: 'WHATSAPP', destinatario: 'x', texto: 't' }),
      () =>
        m
          .get<ClasificadorPreocupaciones>(CLASIFICADOR_PREOCUPACIONES)
          .clasificar('texto'),
    ];
    for (const llamar of llamadas) {
      expect(llamar).toThrow(NotImplementedException);
    }
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
