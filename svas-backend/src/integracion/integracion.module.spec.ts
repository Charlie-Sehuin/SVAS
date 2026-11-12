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
  type DatosSimulacionPdf,
  type DatosVentasPdf,
  GENERADOR_PDF,
  type GeneradorPdf,
} from '../modules/polizas/domain/generador-pdf.port';
import {
  CLASIFICADOR_PREOCUPACIONES,
  type ClasificadorPreocupaciones,
} from '../modules/prueba-choque/domain/clasificador-preocupaciones.port';
import type { DatosPolizaPdf } from '../modules/polizas/domain/poliza';
import { ClasificadorLlmAdapter } from './clasificador/clasificador-llm.adapter';
import { AseguradoraSimuladaAdapter } from './emision/aseguradora-simulada.adapter';
import { fecha, usd } from './pdf/pdfkit-generador.adapter';
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
    expect(() =>
      m
        .get<ClasificadorPreocupaciones>(CLASIFICADOR_PREOCUPACIONES)
        .clasificar('texto'),
    ).toThrow(NotImplementedException);
  });

  describe('AseguradoraSimulada', () => {
    const emision = async () => {
      const e = (await compilar()).get<EmisionAseguradora>(EMISION_ASEGURADORA);
      jest
        .spyOn(e as AseguradoraSimuladaAdapter, 'ahora')
        .mockReturnValue(new Date('2027-01-01T03:00:00Z')); // 31/12/2026 en Lima
      return e;
    };

    it('número PREFIJO-AÑO-8 hex, con el año de Lima', async () => {
      const r = await (
        await emision()
      ).emitir({ codigoEstrategia: 'LA_POSITIVA', ordenId: 'o1' });
      expect(r.numeroPoliza).toMatch(/^LPV-2026-[0-9A-F]{8}$/);
      expect(r.numeroPoliza.length).toBeLessThanOrEqual(30); // poliza.numero varchar(30)
    });

    it('la misma orden da el mismo número; otra orden, otro número', async () => {
      const e = await emision();
      const a = await e.emitir({ codigoEstrategia: 'RIMAC', ordenId: 'o1' });
      expect(
        (await e.emitir({ codigoEstrategia: 'RIMAC', ordenId: 'o1' }))
          .numeroPoliza,
      ).toBe(a.numeroPoliza);
      expect(
        (await e.emitir({ codigoEstrategia: 'RIMAC', ordenId: 'o2' }))
          .numeroPoliza,
      ).not.toBe(a.numeroPoliza);
    });

    it('tiene prefijo para las 5 aseguradoras y rechaza una desconocida', async () => {
      const e = await emision();
      for (const codigo of CODIGOS_ESTRATEGIA) {
        await expect(
          e.emitir({ codigoEstrategia: codigo, ordenId: 'o' }),
        ).resolves.toBeDefined();
      }
      await expect(
        e.emitir({ codigoEstrategia: 'OTRA', ordenId: 'o' }),
      ).rejects.toThrow(/OTRA/);
    });
  });

  describe('PdfkitGenerador', () => {
    const datos = (cuotas = 0): DatosPolizaPdf => ({
      polizaId: 'p1',
      numeroPoliza: 'RIM-2026-4F3A9C21',
      fechaEmision: '2026-11-12T17:40:00Z',
      canalVenta: 'AUTONOMO',
      titular: {
        nombres: 'Ana María',
        apellidos: 'Núñez Peña',
        numeroDocumento: '87654321',
      },
      vehiculo: {
        marca: 'Toyota',
        modelo: 'Corolla',
        anio: 2022,
        placa: 'ABC-123',
      },
      sumaAsegurada: '15000.00',
      primaAnual: '700.00',
      descuento: { tipo: 'PRIMERA_COMPRA', porcentaje: '5.00' },
      primaFinal: '665.00',
      pago: {
        modo: cuotas ? 'CUOTAS' : 'UNICO',
        montoTotal: '665.00',
        numeroCuotas: cuotas || null,
        cuotas: Array.from({ length: cuotas }, (_, i) => ({
          numero: i + 1,
          monto: '55.42',
          fechaVencimiento: `2027-${String(i + 1).padStart(2, '0')}-12`,
          estado: i === 0 ? ('CONFIRMADO' as const) : ('PENDIENTE' as const),
        })),
      },
      contenidoPlan: {
        planId: 'plan-oro',
        aseguradora: 'Rímac',
        plan: 'Oro',
        resumen:
          'Cobertura ampliada con lunas, autopartes y asistencia completa',
        descripcion: null,
        idealPara: null,
        coberturas: Array.from({ length: 13 }, (_, i) => ({
          codigo: `C${i}`,
          nombre: `Cobertura número ${i}`,
          categoria: 'DANOS_PROPIOS' as const,
          incluida: i % 4 !== 0,
          detalle: i === 1 ? 'Hasta USD 200,000' : null,
          limiteMonto: null,
          orden: i,
        })),
        exclusiones: ['Conducir con alcohol sobre el límite legal'],
        requisitos: [
          { tipo: 'CONDUCTOR', texto: 'Licencia vigente', obligatorio: true },
        ],
        congeladoEn: '2026-11-12T17:39:00Z',
      },
    });
    const generar = async (d: DatosPolizaPdf) =>
      (await compilar()).get<GeneradorPdf>(GENERADOR_PDF).generarPoliza(d);

    it('genera un PDF válido', async () => {
      const pdf = await generar(datos());
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(pdf.subarray(-6).toString('latin1')).toContain('%%EOF');
    });

    it('lleva la leyenda de demostración en los metadatos (RNF-20)', async () => {
      // PDFKit guarda los metadatos en UTF-16 big-endian.
      const utf16be = (s: string) =>
        Buffer.from(s, 'utf16le').swap16().toString('latin1');
      expect((await generar(datos())).toString('latin1')).toContain(
        utf16be('Documento de demostraci'),
      );
    });

    it('un plan largo pasa a una segunda página', async () => {
      const paginas = (pdf: Buffer) =>
        Number(
          /\/Type \/Pages\n\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1],
        );
      expect(paginas(await generar(datos(12)))).toBe(1);
      const largo = datos(12);
      largo.contenidoPlan.exclusiones = Array.from(
        { length: 30 },
        (_, i) => `Exclusión de prueba número ${i + 1}`,
      );
      expect(paginas(await generar(largo))).toBeGreaterThanOrEqual(2);
    });
  });

  describe('PdfkitGenerador · simulación y reporte de ventas', () => {
    const paginas = (pdf: Buffer) =>
      Number(/\/Type \/Pages\n\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1]);
    const utf16be = (s: string) =>
      Buffer.from(s, 'utf16le').swap16().toString('latin1');
    /** GUARDAR_PDF=<carpeta> guarda las muestras para revisarlas a ojo. */
    const guardar = async (nombre: string, pdf: Buffer) => {
      const dir = process.env.GUARDAR_PDF;
      if (!dir) return;
      const { writeFile } = await import('node:fs/promises');
      await writeFile(`${dir}/${nombre}`, pdf);
    };
    const generador = async () =>
      (await compilar()).get<GeneradorPdf>(GENERADOR_PDF);

    const simulacion: DatosSimulacionPdf = {
      fecha: '2026-11-12T15:00:00Z',
      zona: 'ALTA',
      vigente: true,
      ranking: Array.from({ length: 10 }, (_, i) => ({
        posicion: i + 1,
        aseguradora: ['Rímac', 'Pacífico', 'La Positiva', 'Mapfre', 'Qualitas'][
          i % 5
        ]!,
        plan: ['Oro', 'Premium', 'Full', 'Total', 'Amplia'][i % 5]!,
        prima: (600 + i * 25).toFixed(2),
        desembolsoEsperado: (90 + i * 10).toFixed(2),
        costoRealAnual: (690 + i * 35).toFixed(2),
        peorCaso: (1500 + i * 100).toFixed(2),
        datosCompletos: i !== 9,
      })),
      contraste:
        'Con el plan más barato (Rímac Plata) pagarías USD 1,200.00 de tu bolsillo en un caso de robo de autopartes; con Pacífico Premium, USD 150.00.',
      leyenda:
        'Estimación referencial basada en condiciones resumidas. Prevalece el condicionado de la aseguradora.',
    };

    it('el resumen de la simulación cabe en 1 página con 10 planes y lleva la leyenda RN-29', async () => {
      const pdf = await (await generador()).generarSimulacion(simulacion);
      await guardar('muestra-simulacion.pdf', pdf);
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(paginas(pdf)).toBe(1);
      expect(pdf.toString('latin1')).toContain(
        utf16be('Estimación referencial'),
      );
    });

    it('el reporte de ventas se genera con y sin ventas', async () => {
      const g = await generador();
      const ventas: DatosVentasPdf = {
        desde: '2026-11-01',
        hasta: '2026-11-30',
        agrupar: 'plan',
        generadoEn: '2026-11-12T15:00:00Z',
        totales: {
          polizas: 2,
          enCuotas: 1,
          primaAnual: '1321.38',
          descuentos: '66.07',
          primaFinal: '1255.31',
          cobrado: '1284.83',
          ticketPromedio: '627.66',
        },
        grupos: [
          {
            etiqueta: 'Rímac · Oro',
            polizas: 1,
            enCuotas: 0,
            primaFinal: '665.00',
            cobrado: '665.00',
            ticketPromedio: '665.00',
            participacion: '52.97',
          },
          {
            etiqueta: 'La Positiva · Full',
            polizas: 1,
            enCuotas: 1,
            primaFinal: '590.31',
            cobrado: '619.83',
            ticketPromedio: '590.31',
            participacion: '47.03',
          },
        ],
      };
      const pdf = await g.generarReporteVentas(ventas);
      await guardar('muestra-ventas.pdf', pdf);
      expect(paginas(pdf)).toBe(1);
      const vacio = await g.generarReporteVentas({ ...ventas, grupos: [] });
      expect(vacio.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });
  });

  it('formatea montos y fechas para el PDF', () => {
    expect(usd('1234567.50')).toBe('USD 1,234,567.50');
    expect(usd('665.00')).toBe('USD 665.00');
    expect(fecha('2027-01-12')).toBe('12/01/2027');
    expect(fecha('2027-01-01T03:00:00Z')).toBe('31/12/2026'); // hora de Lima
  });

  describe('PasarelaSimulada', () => {
    const cobrar = async (monto: string, ordenId = 'o1', key = 'k1') =>
      (await compilar()).get<PasarelaPago>(PASARELA_PAGO).cobrar({
        ordenId,
        monto: new Decimal(monto),
        modo: 'UNICO',
        idempotencyKey: key,
      });

    it('aprueba los montos que no terminan en .13', async () => {
      const r = await cobrar('665.00');
      expect(r.estado).toBe('APROBADO');
      expect(r.referencia).toMatch(/^SIM-[0-9A-F]{20}$/);
    });

    it('rechaza los montos terminados en .13', async () => {
      expect((await cobrar('619.13')).estado).toBe('RECHAZADO');
      expect((await cobrar('0.13')).estado).toBe('RECHAZADO');
      expect((await cobrar('1.135')).estado).toBe('APROBADO'); // redondea a 1.14
    });

    it('es idempotente: misma orden y misma clave → misma referencia', async () => {
      const a = await cobrar('100.00', 'o1', 'k1');
      expect((await cobrar('100.00', 'o1', 'k1')).referencia).toBe(
        a.referencia,
      );
      expect((await cobrar('100.00', 'o1', 'k2')).referencia).not.toBe(
        a.referencia,
      );
      expect((await cobrar('100.00', 'o2', 'k1')).referencia).not.toBe(
        a.referencia,
      );
    });

    it('rechaza montos menores o iguales a 0', async () => {
      await expect(cobrar('0')).rejects.toThrow(/mayores/);
    });
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
