import type { CatalogoPublicoRepository } from '../domain/catalogo-publico.port';
import type { LectorTarjeta, TarjetaCruda } from '../domain/lector-tarjeta.port';
import { LeerTarjetaUseCase } from './leer-tarjeta.use-case';

const ARCHIVO = { datos: Buffer.from('x'), mimeType: 'application/pdf' };

function crear(crudo: TarjetaCruda) {
  const leer = jest.fn().mockResolvedValue(crudo);
  const catalogo = {
    marcas: jest
      .fn()
      .mockResolvedValue([{ id: 'm-vw', nombre: 'Volkswagen' }]),
    modelos: jest.fn().mockResolvedValue([
      { id: 'mo-jetta', nombre: 'Jetta', tipo: 'Sedán' },
      { id: 'mo-golf', nombre: 'Golf', tipo: 'Hatchback' },
    ]),
    anios: jest.fn().mockResolvedValue([2012, 2011, 2010]),
  } as unknown as CatalogoPublicoRepository;
  const useCase = new LeerTarjetaUseCase({ leer } as LectorTarjeta, catalogo);
  return { useCase, leer };
}

describe('LeerTarjetaUseCase', () => {
  it('tarjeta completa: ids del catálogo, año cotizable y placa sin guion', async () => {
    const { useCase, leer } = crear({
      placa: 'ADQ-345',
      marca: 'VOLKSWAGEN',
      modelo: 'JETTA',
      anio: 2011,
    });
    const r = await useCase.ejecutar(ARCHIVO);
    expect(r).toEqual({
      leida: true,
      marca: { id: 'm-vw', nombre: 'Volkswagen' },
      modelo: { id: 'mo-jetta', nombre: 'Jetta' },
      anio: 2011,
      anioCotizable: true,
      placa: 'ADQ345',
    });
    // Gemini recibe el catálogo como únicas opciones.
    expect(leer).toHaveBeenCalledWith(ARCHIVO, [
      { marca: 'Volkswagen', modelos: ['Jetta', 'Golf'] },
    ]);
  });

  it('modelo fuera del catálogo: no se devuelve el modelo, la marca sí', async () => {
    const { useCase } = crear({
      placa: 'ABC123',
      marca: 'Volkswagen',
      modelo: 'Thing',
      anio: 2011,
    });
    const r = await useCase.ejecutar(ARCHIVO);
    expect(r.marca).toEqual({ id: 'm-vw', nombre: 'Volkswagen' });
    expect(r.modelo).toBeUndefined();
    expect(r.anioCotizable).toBeUndefined();
    expect(r.anio).toBe(2011);
  });

  it('año sin cobertura: anioCotizable false', async () => {
    const { useCase } = crear({
      placa: null,
      marca: 'Volkswagen',
      modelo: 'Jetta',
      anio: 2003,
    });
    const r = await useCase.ejecutar(ARCHIVO);
    expect(r.anio).toBe(2003);
    expect(r.anioCotizable).toBe(false);
  });

  it('placa en minúsculas y con guion se normaliza', async () => {
    const { useCase } = crear({
      placa: 'b7k-730',
      marca: null,
      modelo: null,
      anio: null,
    });
    expect((await useCase.ejecutar(ARCHIVO)).placa).toBe('B7K730');
  });

  it('placa inválida o "EN TRÁMITE" se omite', async () => {
    const { useCase } = crear({
      placa: 'EN TRÁMITE',
      marca: 'Volkswagen',
      modelo: 'Jetta',
      anio: 2011,
    });
    expect((await useCase.ejecutar(ARCHIVO)).placa).toBeUndefined();
  });

  it('todo null: no es una tarjeta', async () => {
    const { useCase } = crear({
      placa: null,
      marca: null,
      modelo: null,
      anio: null,
    });
    expect(await useCase.ejecutar(ARCHIVO)).toEqual({ leida: false });
  });
});
