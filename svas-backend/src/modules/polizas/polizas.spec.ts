import { NotFoundException } from '@nestjs/common';
import { EmitirPdfService } from './application/emitir-pdf.service';
import { ESPERA_PENDIENTE_MS, PolizasJobs } from './application/polizas.jobs';
import { PolizasService } from './application/polizas.service';
import type { GeneradorPdf } from './domain/generador-pdf.port';
import {
  claveEnBucket,
  nombreDescarga,
  type DatosPolizaPdf,
} from './domain/poliza';
import type { PolizasRepository } from './domain/polizas.repository.port';

const PDF = Buffer.from('%PDF-1.3 prueba');
const DATOS = {
  polizaId: 'p1',
  numeroPoliza: 'RIM-2026-4F3A9C21',
} as DatosPolizaPdf;

function repo(
  sobre: Partial<PolizasRepository> = {},
): jest.Mocked<PolizasRepository> {
  return {
    mias: jest.fn().mockResolvedValue([]),
    deUsuario: jest.fn().mockResolvedValue({
      id: 'p1',
      numero: 'RIM-2026-4F3A9C21',
      archivoPdf: 'polizas/p1.pdf',
      pdfGenerado: true,
    }),
    datosPdf: jest
      .fn()
      .mockResolvedValue({ archivoPdf: 'polizas/p1.pdf', datos: DATOS }),
    subirPdf: jest.fn().mockResolvedValue(undefined),
    marcarPdfGenerado: jest.fn().mockResolvedValue(undefined),
    descargarPdf: jest.fn().mockResolvedValue(PDF),
    pendientes: jest.fn().mockResolvedValue([]),
    ...sobre,
  } as jest.Mocked<PolizasRepository>;
}

const generador = (falla = false): jest.Mocked<GeneradorPdf> => ({
  generarPoliza: falla
    ? jest.fn().mockRejectedValue(new Error('PDFKit falló'))
    : jest.fn().mockResolvedValue(PDF),
  generarSimulacion: jest.fn(),
  generarReporteVentas: jest.fn(),
});

describe('polizas · dominio', () => {
  it('la clave en el bucket no repite el nombre del bucket', () => {
    expect(claveEnBucket('polizas/abc.pdf')).toBe('abc.pdf');
    expect(claveEnBucket('abc.pdf')).toBe('abc.pdf');
  });

  it('el nombre de descarga es poliza-<numero>.pdf y sin caracteres raros', () => {
    expect(nombreDescarga('RIM-2026-4F3A9C21')).toBe(
      'poliza-RIM-2026-4F3A9C21.pdf',
    );
    expect(nombreDescarga('A/B"C')).toBe('poliza-ABC.pdf');
  });
});

describe('polizas · EmitirPdfService', () => {
  it('genera con los datos de la póliza, sube a su ruta y la marca', async () => {
    const r = repo();
    const g = generador();
    await new EmitirPdfService(r, g).generar('p1');
    expect(g.generarPoliza).toHaveBeenCalledWith(DATOS);
    expect(r.subirPdf).toHaveBeenCalledWith('polizas/p1.pdf', PDF);
    expect(r.marcarPdfGenerado).toHaveBeenCalledWith('p1');
  });

  it('si la subida falla no marca la póliza (el job la reintenta)', async () => {
    const r = repo({
      subirPdf: jest.fn().mockRejectedValue(new Error('Storage caído')),
    });
    await expect(
      new EmitirPdfService(r, generador()).generar('p1'),
    ).rejects.toThrow('Storage');
    expect(r.marcarPdfGenerado).not.toHaveBeenCalled();
  });

  it('intentar() devuelve false en vez de lanzar', async () => {
    expect(
      await new EmitirPdfService(repo(), generador(true)).intentar('p1'),
    ).toBe(false);
    expect(await new EmitirPdfService(repo(), generador()).intentar('p1')).toBe(
      true,
    );
  });

  it('una póliza inexistente es un error', async () => {
    const r = repo({ datosPdf: jest.fn().mockResolvedValue(null) });
    await expect(
      new EmitirPdfService(r, generador()).generar('x'),
    ).rejects.toThrow(/no existe/);
  });
});

describe('polizas · PolizasService.descargar', () => {
  const servicio = (r: PolizasRepository, falla = false) =>
    new PolizasService(r, new EmitirPdfService(r, generador(falla)));

  it('con el PDF listo lo devuelve con su nombre de descarga', async () => {
    const r = repo();
    const d = await servicio(r).descargar('jwt', 'p1');
    expect(d).toEqual({
      listo: true,
      pdf: PDF,
      nombreArchivo: 'poliza-RIM-2026-4F3A9C21.pdf',
    });
    expect(r.deUsuario).toHaveBeenCalledWith('jwt', 'p1');
    expect(r.subirPdf).not.toHaveBeenCalled();
  });

  it('ajena o inexistente → 404 (RLS no la devuelve)', async () => {
    const r = repo({ deUsuario: jest.fn().mockResolvedValue(null) });
    await expect(servicio(r).descargar('jwt', 'p1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('sin PDF todavía: lo genera en el momento y lo entrega', async () => {
    const r = repo({
      deUsuario: jest.fn().mockResolvedValue({
        id: 'p1',
        numero: 'N1',
        archivoPdf: 'polizas/p1.pdf',
        pdfGenerado: false,
      }),
    });
    const d = await servicio(r).descargar('jwt', 'p1');
    expect(d.listo).toBe(true);
    expect(r.subirPdf).toHaveBeenCalled();
  });

  it('si tampoco se puede generar → en generación (202 + PDF_EN_GENERACION)', async () => {
    const r = repo({
      deUsuario: jest.fn().mockResolvedValue({
        id: 'p1',
        numero: 'N1',
        archivoPdf: 'polizas/p1.pdf',
        pdfGenerado: false,
      }),
    });
    const d = await servicio(r, true).descargar('jwt', 'p1');
    expect(d).toMatchObject({
      listo: false,
      warning: { code: 'PDF_EN_GENERACION' },
    });
    expect(r.descargarPdf).not.toHaveBeenCalled();
  });
});

describe('polizas · PolizasJobs', () => {
  it('busca las pendientes con 2 minutos de margen y genera cada una', async () => {
    const r = repo({ pendientes: jest.fn().mockResolvedValue(['a', 'b']) });
    const ahora = new Date('2026-11-12T12:00:00Z');
    const res = await new PolizasJobs(
      r,
      new EmitirPdfService(r, generador()),
    ).regenerarPendientes(ahora);
    expect(res).toEqual({ generados: 2, fallidos: 0 });
    expect(r.pendientes).toHaveBeenCalledWith(
      new Date(ahora.getTime() - ESPERA_PENDIENTE_MS),
      20,
    );
    expect(r.marcarPdfGenerado).toHaveBeenCalledTimes(2);
  });

  it('una falla no detiene a las demás', async () => {
    const r = repo({
      pendientes: jest.fn().mockResolvedValue(['a', 'b']),
      datosPdf: jest
        .fn()
        .mockRejectedValueOnce(new Error('falla a'))
        .mockResolvedValueOnce({ archivoPdf: 'polizas/b.pdf', datos: DATOS }),
    });
    const res = await new PolizasJobs(
      r,
      new EmitirPdfService(r, generador()),
    ).regenerarPendientes();
    expect(res).toEqual({ generados: 1, fallidos: 1 });
  });

  it('si la consulta falla no lanza', async () => {
    const r = repo({
      pendientes: jest.fn().mockRejectedValue(new Error('sin red')),
    });
    await expect(
      new PolizasJobs(
        r,
        new EmitirPdfService(r, generador()),
      ).regenerarPendientes(),
    ).resolves.toEqual({ generados: 0, fallidos: 0 });
  });
});
