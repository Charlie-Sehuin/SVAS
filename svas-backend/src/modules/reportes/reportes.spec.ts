import { BadRequestException } from '@nestjs/common';
import { ReportesService } from './application/reportes.service';
import { fechaLima, resolverPeriodo } from './domain/reportes';
import type { ReportesRepository } from './domain/reportes.repository.port';

// 2026-11-12 02:00 UTC = 2026-11-11 21:00 en Lima.
const HOY = new Date('2026-11-12T02:00:00Z');

describe('reportes · periodo', () => {
  it('la fecha de hoy es la de Lima, no la UTC', () => {
    expect(fechaLima(HOY)).toBe('2026-11-11');
  });

  it('sin fechas: el mes en curso hasta hoy', () => {
    expect(resolverPeriodo({}, HOY)).toEqual({
      desde: '2026-11-01',
      hasta: '2026-11-11',
    });
  });

  it('solo hasta: desde el inicio de ese mes', () => {
    expect(resolverPeriodo({ hasta: '2026-03-15' }, HOY)).toEqual({
      desde: '2026-03-01',
      hasta: '2026-03-15',
    });
  });

  it('solo desde: hasta hoy', () => {
    expect(resolverPeriodo({ desde: '2026-01-01' }, HOY)).toEqual({
      desde: '2026-01-01',
      hasta: '2026-11-11',
    });
  });

  it.each([
    [{ desde: '2026-02-30', hasta: '2026-03-01' }, 'formato AAAA-MM-DD'],
    [{ desde: '2026-05-01', hasta: '2026-04-01' }, 'posterior'],
    [{ desde: '2024-01-01', hasta: '2025-06-01' }, 'un año'],
  ])('%j → error (%s)', (q, mensaje) => {
    expect(resolverPeriodo(q, HOY)).toEqual(expect.stringContaining(mensaje));
  });

  it('un año bisiesto completo sí vale (366 días)', () => {
    expect(
      resolverPeriodo({ desde: '2024-01-01', hasta: '2025-01-01' }, HOY),
    ).toEqual({ desde: '2024-01-01', hasta: '2025-01-01' });
  });
});

describe('reportes · ReportesService', () => {
  const repo: jest.Mocked<ReportesRepository> = {
    ventas: jest.fn().mockResolvedValue({ grupos: [] }),
    retencion: jest.fn().mockResolvedValue({}),
    descuentos: jest.fn().mockResolvedValue({}),
    pruebaChoque: jest.fn().mockResolvedValue({}),
    miDesempeno: jest.fn().mockResolvedValue({}),
  };
  const generarReporteVentas = jest.fn().mockResolvedValue(Buffer.from('%PDF'));
  const servicio = new ReportesService(repo, {
    generarPoliza: jest.fn(),
    generarSimulacion: jest.fn(),
    generarReporteVentas,
  });
  const periodo = { desde: '2026-10-01', hasta: '2026-10-31' };

  beforeEach(() => jest.clearAllMocks());

  it('ventas agrupa por canal si no se indica', async () => {
    await servicio.ventas('jwt', periodo);
    expect(repo.ventas).toHaveBeenCalledWith('jwt', periodo, 'canal');
    await servicio.ventas('jwt', { ...periodo, agrupar: 'plan' });
    expect(repo.ventas).toHaveBeenLastCalledWith('jwt', periodo, 'plan');
  });

  it('cada reporte pasa el periodo y el token del usuario', async () => {
    await servicio.retencion('jwt', periodo);
    await servicio.descuentos('jwt', periodo);
    await servicio.pruebaChoque('jwt', periodo);
    await servicio.miDesempeno('jwt', periodo);
    for (const f of [
      repo.retencion,
      repo.descuentos,
      repo.pruebaChoque,
      repo.miDesempeno,
    ]) {
      expect(f).toHaveBeenCalledWith('jwt', periodo);
    }
  });

  it('ventas en PDF: dibuja el mismo reporte y nombra el archivo por periodo', async () => {
    repo.ventas.mockResolvedValueOnce({
      desde: '2026-10-01',
      hasta: '2026-10-31',
      grupos: [],
    });
    const r = await servicio.ventasPdf('jwt', periodo);
    expect(r.nombreArchivo).toBe('ventas-2026-10-01-a-2026-10-31.pdf');
    expect(generarReporteVentas).toHaveBeenCalledWith(
      expect.objectContaining({
        desde: '2026-10-01',
        generadoEn: expect.any(String),
      }),
    );
  });

  it('periodo inválido → 400 sin llamar a la base', () => {
    expect(() =>
      servicio.retencion('jwt', { desde: '2026-05-01', hasta: '2026-04-01' }),
    ).toThrow(BadRequestException);
    expect(repo.retencion).not.toHaveBeenCalled();
  });
});
