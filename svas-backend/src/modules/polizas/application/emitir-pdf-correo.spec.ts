import { Logger } from '@nestjs/common';
import type { EnviadorCorreo } from '../domain/enviador-correo.port';
import type { GeneradorPdf } from '../domain/generador-pdf.port';
import type { DatosPolizaPdf } from '../domain/poliza';
import type { PolizasRepository } from '../domain/polizas.repository.port';
import { EmitirPdfService } from './emitir-pdf.service';

const PDF = Buffer.from('%PDF-prueba');

const datos = (cambios: Partial<DatosPolizaPdf> = {}) =>
  ({
    polizaId: 'p1',
    numeroPoliza: 'LPV-2026-4750FA93',
    correoTitular: 'maria@gmail.com',
    titular: { nombres: 'maria', apellidos: 'paredes', numeroDocumento: null },
    vehiculo: { marca: 'Audi', modelo: 'Q3', anio: 2016, placa: null },
    contenidoPlan: { aseguradora: 'La Positiva', plan: 'Full' },
    ...cambios,
  }) as unknown as DatosPolizaPdf;

function armar(
  d: DatosPolizaPdf,
  enviar: jest.Mock = jest
    .fn()
    .mockResolvedValue({ enviado: true, referencia: 're_1' }),
) {
  const orden: string[] = [];
  const repo = {
    datosPdf: jest
      .fn()
      .mockResolvedValue({ archivoPdf: 'polizas/p1.pdf', datos: d }),
    subirPdf: jest.fn().mockImplementation(() => {
      orden.push('subir');
      return Promise.resolve();
    }),
    marcarPdfGenerado: jest.fn().mockImplementation(() => {
      orden.push('marcar');
      return Promise.resolve();
    }),
  } as unknown as PolizasRepository;
  const generador = {
    generarPoliza: jest.fn().mockResolvedValue(PDF),
  } as unknown as GeneradorPdf;
  const envio = jest.fn().mockImplementation((...a: unknown[]) => {
    orden.push('correo');
    return enviar(...a);
  });
  const correo: EnviadorCorreo = { enviar: envio };
  return { repo, generador, correo, envio, orden };
}

/** El envío no se espera: se deja pasar un turno para que termine. */
const vaciar = () => new Promise((r) => setImmediate(r));

describe('EmitirPdfService · correo con la póliza', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('al generar el PDF lo manda al correo del titular, con el PDF adjunto, y solo después de dejarlo guardado', async () => {
    const t = armar(datos());
    await new EmitirPdfService(t.repo, t.generador, t.correo).generar('p1');
    await vaciar();

    expect(t.envio).toHaveBeenCalledTimes(1);
    const c = t.envio.mock.calls[0]![0] as Parameters<
      EnviadorCorreo['enviar']
    >[0];
    expect(c.para).toBe('maria@gmail.com');
    expect(c.asunto).toContain('LPV-2026-4750FA93');
    expect(c.adjuntos).toEqual([
      {
        nombre: 'poliza-LPV-2026-4750FA93.pdf',
        contenido: PDF,
        tipo: 'application/pdf',
      },
    ]);
    expect(c.claveIdempotencia).toBe('poliza-p1');
    expect(t.orden).toEqual(['subir', 'marcar', 'correo']);
  });

  it('el titular sin correo: no envía y la póliza se genera igual', async () => {
    const t = armar(datos({ correoTitular: null }));
    await new EmitirPdfService(t.repo, t.generador, t.correo).generar('p1');
    await vaciar();
    expect(t.envio).not.toHaveBeenCalled();
    expect(t.repo.marcarPdfGenerado).toHaveBeenCalledWith('p1');
  });

  it('los correos de datos de demostración (@demo.svas.pe) no reciben nada', async () => {
    const t = armar(datos({ correoTitular: 'cliente7@demo.svas.pe' }));
    await new EmitirPdfService(t.repo, t.generador, t.correo).generar('p1');
    await vaciar();
    expect(t.envio).not.toHaveBeenCalled();
  });

  it('si el correo falla, generar() termina bien y la póliza queda con su PDF', async () => {
    const t = armar(
      datos(),
      jest.fn().mockRejectedValue(new Error('Resend respondió 403')),
    );
    await expect(
      new EmitirPdfService(t.repo, t.generador, t.correo).generar('p1'),
    ).resolves.toBeUndefined();
    await vaciar();
    expect(t.repo.marcarPdfGenerado).toHaveBeenCalledWith('p1');
  });

  it('no hace esperar a la compra: generar() termina aunque el correo tarde', async () => {
    const t = armar(
      datos(),
      jest.fn().mockReturnValue(new Promise(() => undefined)),
    );
    await expect(
      new EmitirPdfService(t.repo, t.generador, t.correo).generar('p1'),
    ).resolves.toBeUndefined();
  });

  it('sin enviador de correo (como en las pruebas anteriores) funciona igual', async () => {
    const t = armar(datos());
    await expect(
      new EmitirPdfService(t.repo, t.generador).generar('p1'),
    ).resolves.toBeUndefined();
    expect(t.envio).not.toHaveBeenCalled();
  });
});
