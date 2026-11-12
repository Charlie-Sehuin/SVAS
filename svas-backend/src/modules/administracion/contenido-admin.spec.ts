import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { aplanarErrores } from '../../common/pipes/validation.pipe';
import { CatalogoAdminService } from './application/catalogo-admin.service';
import { ContenidoAdminService } from './application/contenido-admin.service';
import type { CatalogoAdminRepository } from './domain/catalogo-admin.repository.port';
import {
  aAdvertencia,
  type ContenidoParaGuardar,
} from './domain/contenido-admin';
import type { ContenidoAdminRepository } from './domain/contenido-admin.repository.port';
import {
  GuardarCoberturaDto,
  GuardarContenidoPlanDto,
} from './presentation/dto/contenido-admin.dto';

const PLAN = '6f1c2b1e-8a3d-4c2e-9b7a-1d2e3f4a5b6c';
const COBERTURAS = [
  { codigo: 'DANO_CHOQUE', activa: true },
  { codigo: 'ROBO_PARCIAL', activa: true },
  { codigo: 'VIEJA', activa: false },
];

const CONTENIDO: ContenidoParaGuardar = {
  resumen: 'Cobertura ampliada',
  descripcion: 'Todo lo de Plata y más',
  idealPara: 'Quien no quiere quedarse sin auto',
  coberturas: [
    { codigo: 'DANO_CHOQUE', incluida: true },
    { codigo: 'ROBO_PARCIAL', incluida: false },
  ],
  exclusiones: ['Guerra'],
  requisitos: [{ tipo: 'VEHICULO', texto: 'Del 2015 al 2026' }],
};

const INCOHERENCIA = {
  codigo: 'ROBO_PARCIAL',
  nombre: 'Robo de autopartes',
  incluida: false,
  escenariosQueCubren: ['ROBO_AUTOPARTES'],
};

function crear(parcial: Partial<ContenidoAdminRepository> = {}) {
  const repo = {
    obtener: jest.fn().mockResolvedValue({ planId: PLAN, plan: 'Oro' }),
    incoherencias: jest.fn().mockResolvedValue([]),
    completitud: jest
      .fn()
      .mockResolvedValue([{ planId: PLAN, completo: true }]),
    guardar: jest.fn().mockResolvedValue({ cambio: true, advertencias: [] }),
    listarCoberturas: jest.fn().mockResolvedValue(COBERTURAS),
    guardarCobertura: jest.fn().mockResolvedValue({ planesSinDefinir: 10 }),
    ...parcial,
  } as unknown as jest.Mocked<ContenidoAdminRepository>;
  const publicado = { invalidar: jest.fn() };
  return {
    repo,
    publicado,
    servicio: new ContenidoAdminService(repo, publicado),
  };
}

describe('aAdvertencia (RN-43)', () => {
  it('"no" en el contenido pero la Prueba de Choque cubre', () => {
    expect(aAdvertencia(INCOHERENCIA).mensaje).toBe(
      '«Robo de autopartes» dice que no, pero la Prueba de Choque la cubre en ROBO_AUTOPARTES. Corrige una de las dos.',
    );
  });
  it('"sí" en el contenido pero ningún escenario cubre', () => {
    expect(
      aAdvertencia({ ...INCOHERENCIA, incluida: true, escenariosQueCubren: [] })
        .mensaje,
    ).toBe(
      '«Robo de autopartes» dice que sí, pero la Prueba de Choque dice que no. Corrige una de las dos.',
    );
  });
});

describe('ContenidoAdminService', () => {
  it('obtener: 404 si el plan no existe', async () => {
    const { servicio } = crear({ obtener: jest.fn().mockResolvedValue(null) });
    await expect(servicio.obtener('t', PLAN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('obtener: junta completitud y advertencias', async () => {
    const { servicio } = crear({
      incoherencias: jest.fn().mockResolvedValue([INCOHERENCIA]),
    });
    const r = await servicio.obtener('t', PLAN);
    expect(r.completitud).toEqual({ planId: PLAN, completo: true });
    expect(r.advertencias[0].mensaje).toContain('Robo de autopartes');
  });

  it('guardar: falta una cobertura activa → 400 sin llamar al RPC ni invalidar', async () => {
    const { servicio, repo, publicado } = crear();
    const err = await servicio
      .guardar('t', PLAN, {
        ...CONTENIDO,
        coberturas: [CONTENIDO.coberturas[0]],
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toContain('ROBO_PARCIAL');
    expect(repo.guardar).not.toHaveBeenCalled();
    expect(publicado.invalidar).not.toHaveBeenCalled();
  });

  it('guardar: la cobertura inactiva no se exige', async () => {
    const { servicio, repo } = crear();
    await servicio.guardar('t', PLAN, CONTENIDO);
    expect(repo.guardar).toHaveBeenCalledWith('t', PLAN, CONTENIDO);
  });

  it('guardar: invalida la caché pública y sin advertencias no hay warning', async () => {
    const { servicio, publicado } = crear();
    const r = await servicio.guardar('t', PLAN, CONTENIDO);
    expect(publicado.invalidar).toHaveBeenCalledTimes(1);
    expect(r.cambio).toBe(true);
    expect(r).not.toHaveProperty('warning');
  });

  it('guardar: con contradicciones se guarda igual y vuelve CONTENIDO_INCOHERENTE', async () => {
    const { servicio } = crear({
      guardar: jest
        .fn()
        .mockResolvedValue({ cambio: true, advertencias: [INCOHERENCIA] }),
    });
    const r = await servicio.guardar('t', PLAN, CONTENIDO);
    expect(r.warning?.code).toBe('CONTENIDO_INCOHERENTE');
    expect(r.warning?.message).toContain('Robo de autopartes');
    expect(r.advertencias).toHaveLength(1);
  });

  it('guardarCobertura invalida la caché pública', async () => {
    const { servicio, publicado } = crear();
    const r = await servicio.guardarCobertura('t', 'GRUA_PLUS', {
      nombre: 'Grúa',
      categoria: 'ASISTENCIA',
      descripcion: 'x',
      orden: 14,
      activa: true,
      escenarios: [],
    });
    expect(r.planesSinDefinir).toBe(10);
    expect(publicado.invalidar).toHaveBeenCalledTimes(1);
  });

  it('completitud: solo cuentan los planes activos', async () => {
    const { servicio } = crear({
      completitud: jest.fn().mockResolvedValue([
        { planId: 'a', activo: true, completo: true },
        { planId: 'b', activo: false, completo: false },
        { planId: 'c', activo: true, completo: false },
      ]),
    });
    const r = await servicio.completitud('t');
    expect(r.completo).toBe(false);
    expect(r.planesActivosIncompletos).toBe(1);
  });
});

describe('CatalogoAdminService invalida el contenido público', () => {
  it('al activar o desactivar un plan', async () => {
    const repo = {
      buscarPlan: jest
        .fn()
        .mockResolvedValue({
          id: PLAN,
          nombre: 'Oro',
          descripcion: null,
          activo: true,
        }),
      cambiarEstadoPlan: jest
        .fn()
        .mockResolvedValue({ id: PLAN, activo: false }),
    } as unknown as CatalogoAdminRepository;
    const contenido = { invalidar: jest.fn() };
    await new CatalogoAdminService(repo, contenido).editarPlan('t', PLAN, {
      activo: false,
    });
    expect(contenido.invalidar).toHaveBeenCalledTimes(1);
  });
});

describe('DTOs del contenido de planes', () => {
  const errores = async (cls: new () => object, plano: object) =>
    aplanarErrores(await validate(plainToInstance(cls, plano))).map(
      (e) => e.campo,
    );

  it('contenido válido; recorta textos y exclusiones', async () => {
    const plano = {
      ...CONTENIDO,
      resumen: '  Cobertura ampliada ',
      exclusiones: [' Guerra '],
    };
    expect(await errores(GuardarContenidoPlanDto, plano)).toEqual([]);
    const dto = plainToInstance(GuardarContenidoPlanDto, plano);
    expect(dto.resumen).toBe('Cobertura ampliada');
    expect(dto.exclusiones).toEqual(['Guerra']);
  });

  it.each([
    ['resumen vacío', { resumen: '  ' }, 'resumen'],
    ['resumen de 161', { resumen: 'a'.repeat(161) }, 'resumen'],
    ['sin exclusiones', { exclusiones: [] }, 'exclusiones'],
    ['exclusión vacía', { exclusiones: [' '] }, 'exclusiones'],
    ['sin requisitos', { requisitos: [] }, 'requisitos'],
    [
      'tipo de requisito inválido',
      { requisitos: [{ tipo: 'EDAD', texto: 'x' }] },
      'requisitos.0.tipo',
    ],
    [
      'límite negativo',
      {
        coberturas: [
          { codigo: 'DANO_CHOQUE', incluida: true, limiteMonto: -1 },
        ],
      },
      'coberturas.0.limiteMonto',
    ],
    [
      'detalle vacío',
      { coberturas: [{ codigo: 'DANO_CHOQUE', incluida: true, detalle: ' ' }] },
      'coberturas.0.detalle',
    ],
  ])('contenido: %s → error', async (_n, cambio, campo) => {
    expect(
      await errores(GuardarContenidoPlanDto, { ...CONTENIDO, ...cambio }),
    ).toContain(campo);
  });

  it('cobertura del catálogo: categoría y escenarios', async () => {
    const ok = {
      nombre: 'Grúa',
      categoria: 'ASISTENCIA',
      descripcion: 'x',
      orden: 14,
      activa: true,
      escenarios: [],
    };
    expect(await errores(GuardarCoberturaDto, ok)).toEqual([]);
    expect(
      await errores(GuardarCoberturaDto, {
        ...ok,
        categoria: 'OTRA',
        escenarios: ['robo', 'robo'],
      }),
    ).toEqual(expect.arrayContaining(['categoria', 'escenarios']));
  });
});
