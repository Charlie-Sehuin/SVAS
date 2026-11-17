import type { CatalogoPublicoRepository } from '../domain/catalogo-publico.port';
import type {
  ReconocedorVehiculo,
  ReconocimientoCrudo,
} from '../domain/reconocedor-vehiculo.port';
import {
  normalizar,
  ReconocerVehiculoUseCase,
} from './reconocer-vehiculo.use-case';

const IMAGEN = { datos: Buffer.from('x'), mimeType: 'image/jpeg' };

function crear(crudo: ReconocimientoCrudo) {
  const reconocer = jest.fn().mockResolvedValue(crudo);
  const catalogo = {
    marcas: jest.fn().mockResolvedValue([{ id: 'm-toyota', nombre: 'Toyota' }]),
    modelos: jest.fn().mockResolvedValue([
      { id: 'mo-hilux', nombre: 'Hilux', tipo: 'Pickup' },
      { id: 'mo-corolla', nombre: 'Corolla', tipo: 'Sedán' },
    ]),
    anios: jest.fn().mockResolvedValue([2023, 2022, 2021, 2019]),
  } as unknown as CatalogoPublicoRepository;
  const useCase = new ReconocerVehiculoUseCase(
    { reconocer } as ReconocedorVehiculo,
    catalogo,
  );
  return { useCase, reconocer };
}

describe('ReconocerVehiculoUseCase', () => {
  it('normaliza tildes, mayúsculas y símbolos', () => {
    expect(normalizar(' HÍLUX-2 ')).toBe('hilux 2');
  });

  it('devuelve ids del catálogo y solo los años con cobertura dentro del rango', async () => {
    const { useCase, reconocer } = crear({
      marca: 'toyota',
      modelo: 'HILUX',
      anioDesde: 2020,
      anioHasta: 2022,
      confianza: 0.9,
    });
    const r = await useCase.ejecutar(IMAGEN);
    expect(r).toEqual({
      reconocido: true,
      marca: { id: 'm-toyota', nombre: 'Toyota' },
      modelo: { id: 'mo-hilux', nombre: 'Hilux' },
      aniosProbables: [2022, 2021],
      confianza: 0.9,
    });
    // Gemini recibe el catálogo completo como únicas opciones.
    expect(reconocer).toHaveBeenCalledWith(IMAGEN, [
      { marca: 'Toyota', modelos: ['Hilux', 'Corolla'] },
    ]);
  });

  it('no inventa: un modelo fuera del catálogo es "no reconocido"', async () => {
    const { useCase } = crear({
      marca: 'Toyota',
      modelo: 'Supra',
      anioDesde: 2020,
      anioHasta: 2022,
      confianza: 0.9,
    });
    expect(await useCase.ejecutar(IMAGEN)).toEqual({
      reconocido: false,
      aniosProbables: [],
      confianza: 0,
    });
  });

  it('sin marca ni modelo es "no reconocido"', async () => {
    const { useCase } = crear({
      marca: null,
      modelo: null,
      anioDesde: null,
      anioHasta: null,
      confianza: 0,
    });
    expect((await useCase.ejecutar(IMAGEN)).reconocido).toBe(false);
  });

  it('sin rango de años devuelve el modelo pero ningún año sugerido', async () => {
    const { useCase } = crear({
      marca: 'Toyota',
      modelo: 'Corolla',
      anioDesde: null,
      anioHasta: null,
      confianza: 0.7,
    });
    const r = await useCase.ejecutar(IMAGEN);
    expect(r.reconocido).toBe(true);
    expect(r.aniosProbables).toEqual([]);
  });
});
