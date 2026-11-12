import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { aplanarErrores } from '../../common/pipes/validation.pipe';
import {
  ponerResumenes,
  type PrimaDto,
} from '../cotizacion/application/cotizaciones.use-cases';
import { PlanesService } from './application/planes.service';
import {
  armarComparacion,
  LEYENDA_CONTENIDO,
  validarContenidoPlan,
  type CoberturaCatalogo,
  type ContenidoPlan,
} from './domain/contenido-plan';
import type { ContenidoPlanRepository } from './domain/contenido-plan.repository.port';
import { CompararPlanesQuery } from './presentation/dto/planes.dto';

const ID_ORO = '6f1c2b1e-8a3d-4c2e-9b7a-1d2e3f4a5b6c';
const ID_PLATA = '0b5e9c4d-2f1a-4b3c-8d7e-6a5b4c3d2e1f';
const ID_SIN = '1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d';

const CATALOGO: CoberturaCatalogo[] = [
  {
    codigo: 'LUNAS',
    nombre: 'Rotura de lunas',
    categoria: 'DANOS_PROPIOS',
    orden: 4,
  },
  {
    codigo: 'DANO_CHOQUE',
    nombre: 'Daño por choque',
    categoria: 'DANOS_PROPIOS',
    orden: 1,
  },
  {
    codigo: 'RC_TERCEROS',
    nombre: 'Responsabilidad civil',
    categoria: 'RESPONSABILIDAD',
    orden: 7,
  },
];
const ACTIVAS = CATALOGO.map((c) => c.codigo);

function plan(
  planId: string,
  nombre: string,
  lunas: boolean | null,
  resumen: string | null = `Plan ${nombre}`,
): ContenidoPlan {
  const coberturas = [
    {
      codigo: 'DANO_CHOQUE',
      nombre: 'Daño por choque',
      categoria: 'DANOS_PROPIOS' as const,
      incluida: true,
      detalle: null,
      limiteMonto: null,
      orden: 1,
    },
    ...(lunas === null
      ? []
      : [
          {
            codigo: 'LUNAS',
            nombre: 'Rotura de lunas',
            categoria: 'DANOS_PROPIOS' as const,
            incluida: lunas,
            detalle: null,
            limiteMonto: null,
            orden: 4,
          },
        ]),
    {
      codigo: 'RC_TERCEROS',
      nombre: 'Responsabilidad civil',
      categoria: 'RESPONSABILIDAD' as const,
      incluida: true,
      detalle: 'Hasta USD 100,000',
      limiteMonto: '100000.00',
      orden: 7,
    },
  ];
  return {
    planId,
    aseguradora: 'Rímac',
    plan: nombre,
    resumen,
    descripcion: 'Descripción',
    idealPara: 'Alguien',
    coberturas,
    exclusiones: ['Guerra'],
    requisitos: [
      { tipo: 'VEHICULO', texto: 'Del 2015 al 2026', obligatorio: true },
    ],
    actualizadoEn: '2026-11-12T00:00:00Z',
  };
}

function repo(planes: ContenidoPlan[]): ContenidoPlanRepository {
  return {
    publicado: jest.fn().mockResolvedValue({
      planes: new Map(planes.map((p) => [p.planId, p])),
      catalogo: CATALOGO,
    }),
    invalidar: jest.fn(),
  };
}

describe('validarContenidoPlan (RN-42)', () => {
  const base = {
    coberturas: ACTIVAS.map((codigo) => ({ codigo, incluida: true })),
    exclusiones: ['Guerra', 'Carreras'],
  };

  it('completo: sin errores', () => {
    expect(validarContenidoPlan(base, ACTIVAS)).toEqual([]);
  });

  it('"no cubre" como ausencia → falta la cobertura (no se interpreta como ✗)', () => {
    const e = validarContenidoPlan(
      {
        ...base,
        coberturas: base.coberturas.filter((c) => c.codigo !== 'LUNAS'),
      },
      ACTIVAS,
    );
    expect(e).toEqual([
      {
        campo: 'coberturas',
        mensaje: 'Faltan coberturas por definir (sí o no): LUNAS',
      },
    ]);
  });

  it('cobertura nueva en el catálogo → el plan queda incompleto', () => {
    const e = validarContenidoPlan(base, [...ACTIVAS, 'GRUA_PLUS']);
    expect(e[0].mensaje).toContain('GRUA_PLUS');
  });

  it('desconocida, repetida y "no incluida" con límite', () => {
    const e = validarContenidoPlan(
      {
        coberturas: [
          ...base.coberturas,
          { codigo: 'GRANIZO', incluida: true },
          { codigo: 'LUNAS', incluida: false, limiteMonto: 500 },
        ],
        exclusiones: base.exclusiones,
      },
      ACTIVAS,
    );
    expect(e.map((x) => x.campo)).toEqual([
      'coberturas.3.codigo',
      'coberturas.4.codigo',
      'coberturas.4.limiteMonto',
    ]);
  });

  it('exclusiones repetidas aunque cambien los espacios', () => {
    const e = validarContenidoPlan(
      { ...base, exclusiones: ['Guerra', ' Guerra '] },
      ACTIVAS,
    );
    expect(e).toEqual([
      { campo: 'exclusiones.1', mensaje: 'Hay exclusiones repetidas' },
    ]);
  });
});

describe('armarComparacion', () => {
  it('filas en el orden del catálogo, valores alineados con los planes', () => {
    const c = armarComparacion(
      [plan(ID_PLATA, 'Plata', false), plan(ID_ORO, 'Oro', true)],
      CATALOGO,
    );
    expect(c.planes.map((p) => p.plan)).toEqual(['Plata', 'Oro']);
    expect(c.filas.map((f) => f.codigo)).toEqual([
      'DANO_CHOQUE',
      'LUNAS',
      'RC_TERCEROS',
    ]);
    expect(c.filas[1].valores).toEqual([
      { incluida: false, detalle: null },
      { incluida: true, detalle: null },
    ]);
  });

  it('un plan sin fila para una cobertura → null (no ✗)', () => {
    const c = armarComparacion(
      [plan(ID_PLATA, 'Plata', null), plan(ID_ORO, 'Oro', true)],
      CATALOGO,
    );
    expect(c.filas.find((f) => f.codigo === 'LUNAS')?.valores[0]).toBeNull();
  });
});

describe('PlanesService', () => {
  it('contenido: leyenda RN-46 y coberturas sin el campo interno orden', async () => {
    const r = await new PlanesService(
      repo([plan(ID_ORO, 'Oro', true)]),
    ).contenido(ID_ORO);
    expect(r.leyenda).toBe(LEYENDA_CONTENIDO);
    expect(r.coberturas).toHaveLength(3);
    expect(r.coberturas[0]).not.toHaveProperty('orden');
    expect(r.coberturas[2].limiteMonto).toBe('100000.00');
  });

  it.each([
    ['plan inexistente o inactivo', ID_SIN],
    ['plan sin contenido (resumen null)', ID_PLATA],
  ])('contenido: 404 si %s', async (_n, id) => {
    const s = new PlanesService(repo([plan(ID_PLATA, 'Plata', false, null)]));
    await expect(s.contenido(id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('comparar: 404 si uno de los planes no está publicado', async () => {
    const s = new PlanesService(repo([plan(ID_ORO, 'Oro', true)]));
    await expect(s.comparar([ID_ORO, ID_SIN])).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('comparar: matriz y leyenda', async () => {
    const s = new PlanesService(
      repo([plan(ID_ORO, 'Oro', true), plan(ID_PLATA, 'Plata', false)]),
    );
    const r = await s.comparar([ID_ORO, ID_PLATA]);
    expect(r.planes.map((p) => p.planId)).toEqual([ID_ORO, ID_PLATA]);
    expect(r.leyenda).toBe(LEYENDA_CONTENIDO);
  });
});

describe('CompararPlanesQuery', () => {
  const campos = async (ids: unknown) =>
    aplanarErrores(
      await validate(plainToInstance(CompararPlanesQuery, { ids })),
    ).map((e) => e.mensaje);

  it('acepta "a,b" y "a,b,c"', async () => {
    expect(await campos(`${ID_ORO},${ID_PLATA}`)).toEqual([]);
    expect(await campos(`${ID_ORO}, ${ID_PLATA},${ID_SIN}`)).toEqual([]);
    expect(
      plainToInstance(CompararPlanesQuery, { ids: `${ID_ORO},${ID_PLATA}` })
        .ids,
    ).toEqual([ID_ORO, ID_PLATA]);
  });

  it('4 planes → "hasta 3" (COMPARAR_MAXIMO_3)', async () => {
    const cuatro = [
      ID_ORO,
      ID_PLATA,
      ID_SIN,
      '2b3c4d5e-6f7a-4b2c-9d3e-4f5a6b7c8d9e',
    ].join(',');
    expect(await campos(cuatro)).toContain('Puedes comparar hasta 3 planes');
  });

  it('1 plan, repetidos o un id inválido → error', async () => {
    expect(await campos(ID_ORO)).toContain(
      'Elige al menos 2 planes para comparar',
    );
    expect(await campos(`${ID_ORO},${ID_ORO}`)).toContain(
      'Hay planes repetidos',
    );
    expect(await campos(`${ID_ORO},abc`)).toContain('Algún plan no es válido');
  });
});

describe('ponerResumenes (cotización)', () => {
  const prima = (planId: string) =>
    ({ planId, resumen: null }) as unknown as PrimaDto;

  it('completa el resumen de cada plan', async () => {
    const primas = [prima(ID_ORO), prima(ID_PLATA)];
    const fuente = {
      resumenes: jest
        .fn()
        .mockResolvedValue(new Map([[ID_ORO, 'Cobertura ampliada']])),
    };
    await ponerResumenes(primas, fuente);
    expect(primas.map((p) => p.resumen)).toEqual(['Cobertura ampliada', null]);
    expect(fuente.resumenes).toHaveBeenCalledWith([ID_ORO, ID_PLATA]);
  });

  it('si la lectura falla, la cotización sigue con resumen null', async () => {
    const primas = [prima(ID_ORO)];
    await ponerResumenes(primas, {
      resumenes: jest.fn().mockRejectedValue(new Error('caído')),
    });
    expect(primas[0].resumen).toBeNull();
  });

  it('sin fuente no hace nada', async () => {
    const primas = [prima(ID_ORO)];
    await ponerResumenes(primas);
    expect(primas[0].resumen).toBeNull();
  });
});
