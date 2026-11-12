import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EstrategiaRegistry } from '../../integracion/estrategias/estrategia.registry';
import { TarifasAdminService } from './application/tarifas-admin.service';
import { claveValida } from './domain/tarifas';
import type { TarifasAdminRepository } from './domain/tarifas-admin.repository.port';

const ASEGURADORAS = [
  { id: 'a-rimac', nombre: 'Rímac', activa: true, codigoEstrategia: 'RIMAC' },
  {
    id: 'a-pac',
    nombre: 'Pacífico',
    activa: true,
    codigoEstrategia: 'PACIFICO',
  },
  {
    id: 'a-lp',
    nombre: 'La Positiva',
    activa: true,
    codigoEstrategia: 'LA_POSITIVA',
  },
  { id: 'a-map', nombre: 'Mapfre', activa: false, codigoEstrategia: 'MAPFRE' },
];
const UUID = '6f1c2b1e-8a3d-4c2e-9b7a-1d2e3f4a5b6c';

function crear(parcial: Partial<TarifasAdminRepository> = {}) {
  const repo = {
    listarAseguradoras: jest.fn().mockResolvedValue(ASEGURADORAS),
    codigoEstrategiaDelPlan: jest.fn().mockResolvedValue('PACIFICO'),
    guardarTarifaPlan: jest.fn().mockResolvedValue({}),
    guardarPesos: jest
      .fn()
      .mockResolvedValue({ recibidas: 1, cambiadas: 1, total: 1 }),
    guardarRangos: jest
      .fn()
      .mockResolvedValue({ recibidas: 1, cambiadas: 1, total: 1 }),
    listarFaltantes: jest.fn().mockResolvedValue([]),
    ...parcial,
  } as unknown as jest.Mocked<TarifasAdminRepository>;
  return {
    repo,
    servicio: new TarifasAdminService(repo, new EstrategiaRegistry()),
  };
}

describe('Estrategias: parámetros y pesos (RN-40)', () => {
  const registro = new EstrategiaRegistry();
  const ok = (codigo: string, p: object) =>
    registro.obtener(codigo).parametrosSchema.safeParse(p).success;

  it.each([
    ['RIMAC', {}],
    ['PACIFICO', { cargo_fijo_anual: 45 }],
    ['LA_POSITIVA', { recargo_pago_mensual: 0.05 }],
    ['MAPFRE', { prima_minima_anual: 250 }],
    ['QUALITAS', { descuento_comercial: 0.05 }],
  ])('%s acepta los parámetros del seed', (codigo, p) => {
    expect(ok(codigo, p)).toBe(true);
  });

  it('rechaza claves de otra aseguradora y valores fuera de rango', () => {
    expect(ok('RIMAC', { cargo_fijo_anual: 30 })).toBe(false);
    expect(ok('LA_POSITIVA', { recargo_pago_mensual: 5 })).toBe(false);
    expect(ok('MAPFRE', { prima_minima_anual: 0 })).toBe(false);
    expect(ok('PACIFICO', {})).toBe(false);
  });

  it('pesos: La Positiva exige tipo; Pacífico usa ubigeo opcional', () => {
    expect(registro.obtener('LA_POSITIVA').pesosRequeridos).toContain('tipo');
    expect(registro.obtener('PACIFICO').pesosRequeridos).not.toContain(
      'ubigeo',
    );
    expect(registro.obtener('PACIFICO').pesosOpcionales).toEqual(['ubigeo']);
    expect(registro.obtener('RIMAC').pesosRequeridos).toEqual([
      'marca',
      'modelo',
      'anio',
    ]);
  });
});

describe('claveValida', () => {
  it('valida según la tabla', () => {
    expect(claveValida('anio', '2022')).toBe(true);
    expect(claveValida('anio', '22')).toBe(false);
    expect(claveValida('ubigeo', '150122')).toBe(true);
    expect(claveValida('ubigeo', '15012A')).toBe(false);
    expect(claveValida('marca', UUID)).toBe(true);
    expect(claveValida('marca', 'Toyota')).toBe(false);
  });
});

describe('TarifasAdminService', () => {
  it('guardarTarifaPlan: 404 si el plan no existe', async () => {
    const { servicio } = crear({
      codigoEstrategiaDelPlan: jest.fn().mockResolvedValue(null),
    });
    await expect(
      servicio.guardarTarifaPlan('t', UUID, 0.04, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('guardarTarifaPlan: valida parametros con el zod de la Estrategia', async () => {
    const { repo, servicio } = crear();
    const err = await servicio
      .guardarTarifaPlan('t', UUID, 0.04, { prima_minima_anual: 250 })
      .catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    const cuerpo = (err as BadRequestException).getResponse() as {
      errors: { campo: string }[];
    };
    expect(cuerpo.errors.map((e) => e.campo)).toEqual(
      expect.arrayContaining(['parametros.cargo_fijo_anual', 'parametros']),
    );
    expect(repo.guardarTarifaPlan).not.toHaveBeenCalled();
  });

  it('guardarTarifaPlan: parámetros válidos llegan al repositorio', async () => {
    const { repo, servicio } = crear();
    await servicio.guardarTarifaPlan('t', UUID, 0.04, { cargo_fijo_anual: 45 });
    expect(repo.guardarTarifaPlan).toHaveBeenCalledWith('t', UUID, 0.04, {
      cargo_fijo_anual: 45,
    });
  });

  it('guardarPesos: rechaza una tabla que la fórmula no usa', async () => {
    const { repo, servicio } = crear();
    await expect(
      servicio.guardarPesos('t', 'tipo', 'a-rimac', [{ clave: UUID, peso: 1 }]),
    ).rejects.toThrow('La fórmula de Rímac no usa peso de tipo de vehículo');
    expect(repo.guardarPesos).not.toHaveBeenCalled();
  });

  it('guardarPesos: acepta ubigeo para Pacífico (opcional) y valida claves', async () => {
    const { repo, servicio } = crear();
    await servicio.guardarPesos('t', 'ubigeo', 'a-pac', [
      { clave: '150122', peso: 0.98 },
    ]);
    expect(repo.guardarPesos).toHaveBeenCalled();
    await expect(
      servicio.guardarPesos('t', 'anio', 'a-pac', [
        { clave: '2022', peso: 1 },
        { clave: '2022', peso: 1.1 },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('guardarPesos: 404 si la aseguradora no existe', async () => {
    const { servicio } = crear();
    await expect(
      servicio.guardarPesos('t', 'marca', 'otra', [{ clave: UUID, peso: 1 }]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('guardarRangos: mínima > máxima → 400', async () => {
    const { repo, servicio } = crear();
    await expect(
      servicio.guardarRangos('t', 'a-rimac', [
        { modeloId: UUID, anio: 2022, sumaMinima: 20000, sumaMaxima: 10000 },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.guardarRangos).not.toHaveBeenCalled();
  });

  it('completitud: solo aseguradoras activas y con los pesos de su fórmula', async () => {
    const { repo, servicio } = crear({
      listarFaltantes: jest
        .fn()
        .mockImplementation((_t, id: string) =>
          Promise.resolve(
            id === 'a-lp'
              ? [
                  {
                    aseguradoraId: id,
                    sinRango: false,
                    pesosFaltantes: ['tipo'],
                  },
                ]
              : [],
          ),
        ),
    });
    const r = await servicio.completitud('t');
    expect(repo.listarFaltantes).toHaveBeenCalledTimes(3); // Mapfre está inactiva
    expect(repo.listarFaltantes).toHaveBeenCalledWith('t', 'a-lp', [
      'marca',
      'modelo',
      'anio',
      'tipo',
    ]);
    expect(r).toMatchObject({
      completa: false,
      sinRango: 0,
      conPesosFaltantes: 1,
    });
  });
});
