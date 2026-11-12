import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { aplanarErrores } from '../../common/pipes/validation.pipe';
import { USO_VEHICULO, ZONA_RIESGO } from '../../shared/types/enums';
import { PruebaChoqueAdminService } from './application/prueba-choque-admin.service';
import { pendientesDeEscenario } from './domain/prueba-choque-admin';
import type { PruebaChoqueAdminRepository } from './domain/prueba-choque-admin.repository.port';
import {
  CodigoEscenarioParam,
  GuardarCoberturasDto,
  GuardarEscenarioDto,
  GuardarFactoresDto,
  GuardarFrecuenciasDto,
  GuardarZonasDto,
} from './presentation/dto/prueba-choque-admin.dto';

const PLAN_A = '6f1c2b1e-8a3d-4c2e-9b7a-1d2e3f4a5b6c';
const PLAN_B = '0b5e9c4d-2f1a-4b3c-8d7e-6a5b4c3d2e1f';
const PLANES = [
  { planId: PLAN_A, plan: 'Oro', aseguradora: 'Rímac' },
  { planId: PLAN_B, plan: 'Plata', aseguradora: 'Rímac' },
];

const escenario = (codigo: string, activo = true) => ({
  id: `id-${codigo}`,
  codigo,
  nombre: codigo,
  descripcion: 'x',
  montoDanoReferencial: '600.00',
  diasTaller: 3,
  orden: 1,
  activo,
});

/** Las 9 combinaciones uso × zona de un escenario. */
const todasLasFrecuencias = (codigo: string) =>
  USO_VEHICULO.flatMap((uso) =>
    ZONA_RIESGO.map((zona) => ({
      escenario: codigo,
      uso,
      zona,
      probabilidadAnual: '0.1000',
    })),
  );

const RESUMEN = { recibidas: 1, cambiadas: 1, total: 1 };

function crear(parcial: Partial<PruebaChoqueAdminRepository> = {}) {
  const repo = {
    listarEscenarios: jest.fn().mockResolvedValue([]),
    listarFrecuencias: jest.fn().mockResolvedValue([]),
    listarCoberturas: jest.fn().mockResolvedValue([]),
    planesActivos: jest.fn().mockResolvedValue(PLANES),
    guardarEscenario: jest.fn().mockResolvedValue({}),
    guardarCoberturas: jest.fn().mockResolvedValue(RESUMEN),
    guardarFrecuencias: jest.fn().mockResolvedValue(RESUMEN),
    guardarZonas: jest.fn().mockResolvedValue(RESUMEN),
    guardarFactores: jest.fn().mockResolvedValue(RESUMEN),
    ...parcial,
  } as unknown as jest.Mocked<PruebaChoqueAdminRepository>;
  return { repo, servicio: new PruebaChoqueAdminService(repo) };
}

async function errorDe(p: Promise<unknown>) {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(BadRequestException);
  return (e as BadRequestException).getResponse() as {
    message: string;
    errors: { campo: string; mensaje: string }[];
  };
}

describe('pendientesDeEscenario', () => {
  it('sin frecuencias ni coberturas: faltan las 9 combinaciones y todos los planes', () => {
    const p = pendientesDeEscenario(
      'NUEVO',
      [],
      [],
      PLANES,
      USO_VEHICULO,
      ZONA_RIESGO,
    );
    expect(p.frecuenciasFaltantes).toHaveLength(9);
    expect(p.planesSinCobertura.map((x) => x.planId)).toEqual([PLAN_A, PLAN_B]);
  });

  it('solo cuenta las filas del propio escenario', () => {
    const frecuencias = [
      ...todasLasFrecuencias('OTRO'),
      ...todasLasFrecuencias('NUEVO').filter(
        (f) => !(f.uso === 'TRANSPORTE_PASAJEROS' && f.zona === 'BAJA'),
      ),
    ];
    const coberturas = [
      { escenario: 'NUEVO', planId: PLAN_A },
      { escenario: 'OTRO', planId: PLAN_B },
    ];
    const p = pendientesDeEscenario(
      'NUEVO',
      frecuencias,
      coberturas,
      PLANES,
      USO_VEHICULO,
      ZONA_RIESGO,
    );
    expect(p.frecuenciasFaltantes).toEqual([
      { uso: 'TRANSPORTE_PASAJEROS', zona: 'BAJA' },
    ]);
    expect(p.planesSinCobertura.map((x) => x.planId)).toEqual([PLAN_B]);
  });

  it('completo: nada pendiente', () => {
    const p = pendientesDeEscenario(
      'X',
      todasLasFrecuencias('X'),
      PLANES.map((pl) => ({ escenario: 'X', planId: pl.planId })),
      PLANES,
      USO_VEHICULO,
      ZONA_RIESGO,
    );
    expect(p).toEqual({ frecuenciasFaltantes: [], planesSinCobertura: [] });
  });
});

describe('PruebaChoqueAdminService', () => {
  it('listarEscenarios: pendientes solo en los activos', async () => {
    const { servicio } = crear({
      listarEscenarios: jest
        .fn()
        .mockResolvedValue([
          escenario('CHOQUE_LEVE'),
          escenario('VIEJO', false),
        ]),
      listarFrecuencias: jest
        .fn()
        .mockResolvedValue(todasLasFrecuencias('CHOQUE_LEVE')),
      listarCoberturas: jest
        .fn()
        .mockResolvedValue([{ escenario: 'CHOQUE_LEVE', planId: PLAN_A }]),
    });
    const [activo, inactivo] = await servicio.listarEscenarios('t');
    expect(activo.pendientes).toEqual({
      frecuenciasFaltantes: [],
      planesSinCobertura: [PLANES[1]],
    });
    expect(inactivo.pendientes).toBeNull();
  });

  it('cobertura que no cubre pero trae deducible → 400 sin llamar al RPC', async () => {
    const { servicio, repo } = crear();
    const r = await errorDe(
      servicio.guardarCoberturas('t', [
        {
          planId: PLAN_A,
          escenario: 'CHOQUE_LEVE',
          cubre: true,
          deduciblePct: 10,
          fuente: 'x',
        },
        {
          planId: PLAN_A,
          escenario: 'ROBO_TOTAL',
          cubre: false,
          diasAutoReemplazo: 5,
          fuente: 'x',
        },
      ]),
    );
    expect(r.errors).toEqual([
      {
        campo: 'filas.1',
        mensaje:
          'Si el plan no cubre el escenario, no lleva deducible, tope ni días de reemplazo',
      },
    ]);
    expect(repo.guardarCoberturas).not.toHaveBeenCalled();
  });

  it('cobertura que no cubre con todo en null o 0 pasa', async () => {
    const { servicio, repo } = crear();
    await servicio.guardarCoberturas('t', [
      {
        planId: PLAN_A,
        escenario: 'ROBO_AUTOPARTES',
        cubre: false,
        deduciblePct: null,
        topeCobertura: null,
        diasAutoReemplazo: 0,
        fuente: 'Exclusión 4.2',
      },
    ]);
    expect(repo.guardarCoberturas).toHaveBeenCalledTimes(1);
  });

  it('coberturas repetidas (aunque el uuid cambie de mayúsculas) → 400', async () => {
    const { servicio } = crear();
    const r = await errorDe(
      servicio.guardarCoberturas('t', [
        { planId: PLAN_A, escenario: 'CHOQUE_LEVE', cubre: false, fuente: 'x' },
        {
          planId: PLAN_A.toUpperCase(),
          escenario: 'CHOQUE_LEVE',
          cubre: false,
          fuente: 'y',
        },
      ]),
    );
    expect(r.errors[0].campo).toBe('filas.1');
  });

  it.each([
    [
      'frecuencias',
      (s: PruebaChoqueAdminService) =>
        s.guardarFrecuencias('t', [
          {
            escenario: 'A_B',
            uso: 'PARTICULAR',
            zona: 'ALTA',
            probabilidadAnual: 0.1,
          },
          {
            escenario: 'A_B',
            uso: 'PARTICULAR',
            zona: 'ALTA',
            probabilidadAnual: 0.2,
          },
        ]),
    ],
    [
      'zonas',
      (s: PruebaChoqueAdminService) =>
        s.guardarZonas('t', [
          { ubigeo: '150101', zona: 'ALTA' },
          { ubigeo: '150101', zona: 'BAJA' },
        ]),
    ],
    [
      'factores',
      (s: PruebaChoqueAdminService) =>
        s.guardarFactores('t', [
          { escenario: 'A_B', variable: 'KM_MES_ALTO', multiplicador: 1.2 },
          { escenario: 'A_B', variable: 'KM_MES_ALTO', multiplicador: 1.3 },
        ]),
    ],
  ])('%s repetidas → 400 en filas.1', async (_n, llamar) => {
    const { servicio } = crear();
    const r = await errorDe(llamar(servicio));
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].campo).toBe('filas.1');
  });

  it('sin repetidos, pasa cada carga al repositorio', async () => {
    const { servicio, repo } = crear();
    await servicio.guardarFrecuencias('t', [
      {
        escenario: 'A_B',
        uso: 'PARTICULAR',
        zona: 'ALTA',
        probabilidadAnual: 0.1,
      },
      {
        escenario: 'A_B',
        uso: 'PARTICULAR',
        zona: 'BAJA',
        probabilidadAnual: 0.1,
      },
    ]);
    await servicio.guardarZonas('t', [{ ubigeo: '150101', zona: 'ALTA' }]);
    await servicio.guardarFactores('t', [
      { escenario: 'A_B', variable: 'KM_MES_ALTO', multiplicador: 1.2 },
      { escenario: 'A_B', variable: 'USO_NOCTURNO', multiplicador: 1.2 },
    ]);
    expect(repo.guardarFrecuencias).toHaveBeenCalledTimes(1);
    expect(repo.guardarZonas).toHaveBeenCalledTimes(1);
    expect(repo.guardarFactores).toHaveBeenCalledTimes(1);
  });
});

describe('DTOs del catálogo de la Prueba de Choque', () => {
  const errores = async (cls: new () => object, plano: object) =>
    aplanarErrores(await validate(plainToInstance(cls, plano))).map(
      (e) => e.campo,
    );

  const ESCENARIO = {
    nombre: ' Inundación ',
    descripcion: 'El agua entra al motor',
    montoDanoReferencial: 1200.5,
    diasTaller: 20,
    orden: 7,
    activo: true,
  };

  it('escenario válido; el nombre se recorta', async () => {
    expect(await errores(GuardarEscenarioDto, ESCENARIO)).toEqual([]);
    expect(plainToInstance(GuardarEscenarioDto, ESCENARIO).nombre).toBe(
      'Inundación',
    );
  });

  it('monto null vale (suma asegurada), pero no puede faltar', async () => {
    expect(
      await errores(GuardarEscenarioDto, {
        ...ESCENARIO,
        montoDanoReferencial: null,
      }),
    ).toEqual([]);
    const { montoDanoReferencial: _m, ...sinMonto } = ESCENARIO;
    expect(await errores(GuardarEscenarioDto, sinMonto)).toContain(
      'montoDanoReferencial',
    );
  });

  it.each([
    ['nombre vacío', { nombre: '   ' }, 'nombre'],
    ['monto 0', { montoDanoReferencial: 0 }, 'montoDanoReferencial'],
    ['días con decimales', { diasTaller: 3.5 }, 'diasTaller'],
    ['días > 365', { diasTaller: 400 }, 'diasTaller'],
    ['activo como texto', { activo: 'si' }, 'activo'],
  ])('escenario: %s → error', async (_n, cambio, campo) => {
    expect(
      await errores(GuardarEscenarioDto, { ...ESCENARIO, ...cambio }),
    ).toContain(campo);
  });

  it.each([
    ['CHOQUE_LEVE', true],
    ['choque_leve', false],
    ['CHOQUE-LEVE', false],
    ['X', false],
  ])('código de escenario %s → válido=%s', async (codigo, ok) => {
    expect((await errores(CodigoEscenarioParam, { codigo })).length === 0).toBe(
      ok,
    );
  });

  it('cobertura: lo opcional puede faltar o ser null; los rangos se validan', async () => {
    const base = {
      planId: PLAN_A,
      escenario: 'CHOQUE_LEVE',
      cubre: true,
      fuente: 'x',
    };
    expect(await errores(GuardarCoberturasDto, { filas: [base] })).toEqual([]);
    expect(
      await errores(GuardarCoberturasDto, {
        filas: [{ ...base, deduciblePct: null, topeCobertura: null }],
      }),
    ).toEqual([]);
    expect(
      await errores(GuardarCoberturasDto, {
        filas: [
          {
            ...base,
            deduciblePct: 150,
            topeCobertura: 0,
            condicionTaller: 'PROPIO',
            fuente: ' ',
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'filas.0.deduciblePct',
        'filas.0.topeCobertura',
        'filas.0.condicionTaller',
        'filas.0.fuente',
      ]),
    );
    expect(await errores(GuardarCoberturasDto, { filas: [] })).toEqual([
      'filas',
    ]);
  });

  it('frecuencia: tope 0.95 y hasta 4 decimales', async () => {
    const f = { escenario: 'CHOQUE_LEVE', uso: 'PARTICULAR', zona: 'ALTA' };
    expect(
      await errores(GuardarFrecuenciasDto, {
        filas: [{ ...f, probabilidadAnual: 0.95 }],
      }),
    ).toEqual([]);
    expect(
      await errores(GuardarFrecuenciasDto, {
        filas: [{ ...f, probabilidadAnual: 0.96 }],
      }),
    ).toEqual(['filas.0.probabilidadAnual']);
    expect(
      await errores(GuardarFrecuenciasDto, {
        filas: [{ ...f, uso: 'TAXI', probabilidadAnual: 0.12345 }],
      }),
    ).toEqual(
      expect.arrayContaining(['filas.0.uso', 'filas.0.probabilidadAnual']),
    );
  });

  it('zona: ubigeo de 6 dígitos y zona del enum', async () => {
    expect(
      await errores(GuardarZonasDto, {
        filas: [{ ubigeo: '150101', zona: 'BAJA' }],
      }),
    ).toEqual([]);
    expect(
      await errores(GuardarZonasDto, {
        filas: [{ ubigeo: '15010', zona: 'MUY_ALTA' }],
      }),
    ).toEqual(['filas.0.ubigeo', 'filas.0.zona']);
  });

  it('factor: multiplicador entre 0.10 y 3.00', async () => {
    const f = { escenario: 'ROBO_AUTOPARTES', variable: 'ESTACIONA_COCHERA' };
    expect(
      await errores(GuardarFactoresDto, {
        filas: [{ ...f, multiplicador: 0.6 }],
      }),
    ).toEqual([]);
    expect(
      await errores(GuardarFactoresDto, {
        filas: [{ ...f, multiplicador: 3.5 }],
      }),
    ).toEqual(['filas.0.multiplicador']);
    expect(
      await errores(GuardarFactoresDto, {
        filas: [{ ...f, variable: 'LLUVIA', multiplicador: 1 }],
      }),
    ).toEqual(['filas.0.variable']);
  });
});
