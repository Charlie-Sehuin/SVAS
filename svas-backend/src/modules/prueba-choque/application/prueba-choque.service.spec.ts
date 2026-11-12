import { BadRequestException, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import type {
  CotizacionGuardada,
  CotizacionRepository,
} from '../../cotizacion/domain/cotizacion.repository.port';
import type {
  CatalogoSimulacion,
  PruebaChoqueRepository,
  SimulacionGuardada,
  SimulacionParaGuardar,
} from '../domain/prueba-choque.repository.port';
import { PruebaChoqueService, versionReglas } from './prueba-choque.service';
import { armarRespuesta, warningIncompletos } from './vista-simulacion';

const d = (v: string | number) => new Decimal(v);

const cotizacion = (
  cambios: Partial<CotizacionGuardada> = {},
): CotizacionGuardada =>
  ({
    id: 'cot-1',
    estado: 'REGISTRADA',
    vehiculo: { uso: 'PARTICULAR', ubigeo: '150122' },
    primas: [
      {
        id: 'pc-a',
        planId: 'plan-a',
        disponible: true,
        prima: d(500),
        sumaAsegurada: d(15000),
      },
      {
        id: 'pc-b',
        planId: 'plan-b',
        disponible: true,
        prima: d(700),
        sumaAsegurada: d(15000),
      },
      {
        id: 'pc-x',
        planId: 'plan-x',
        disponible: false,
        prima: null,
        sumaAsegurada: null,
      },
    ],
    ...cambios,
  }) as CotizacionGuardada;

const catalogo = (): CatalogoSimulacion => ({
  zona: 'BAJA',
  escenarios: [
    {
      id: 'e1',
      codigo: 'CHOQUE_LEVE',
      montoDano: d(600),
      diasTaller: 3,
      nombre: 'Choque leve',
      descripcion: '',
      orden: 1,
    },
    {
      id: 'e2',
      codigo: 'ROBO_TOTAL',
      montoDano: null,
      diasTaller: 30,
      nombre: 'Robo total',
      descripcion: '',
      orden: 2,
    },
  ],
  reglas: [
    {
      planId: 'plan-a',
      escenarioId: 'e1',
      cubre: true,
      deduciblePct: d('0.10'),
      deducibleMinimo: d(150),
      tope: null,
      diasReemplazo: 0,
    },
    {
      planId: 'plan-b',
      escenarioId: 'e1',
      cubre: true,
      deduciblePct: d('0.10'),
      deducibleMinimo: d(100),
      tope: null,
      diasReemplazo: 0,
    },
    {
      planId: 'plan-b',
      escenarioId: 'e2',
      cubre: true,
      deduciblePct: d('0.20'),
      deducibleMinimo: d(500),
      tope: null,
      diasReemplazo: 0,
    },
  ],
  probabilidades: new Map([
    ['e1', d('0.20')],
    ['e2', d('0.01')],
  ]),
  factores: [],
  tipoCambio: d('3.75'),
});

const guardada = (): SimulacionGuardada => ({
  id: 'sim-1',
  zona: 'BAJA',
  fecha: '2026-11-12T10:00:00Z',
  vigente: true,
  planes: [
    {
      primaCotizadaId: 'pc-b',
      aseguradora: 'B',
      plan: 'Plan B',
      costoRealAnual: d('751.00'),
      peorCaso: d('3000.00'),
      ranking: 1,
      datosCompletos: true,
    },
    {
      primaCotizadaId: 'pc-a',
      aseguradora: 'A',
      plan: 'Plan A',
      costoRealAnual: d('530.00'),
      peorCaso: d('150.00'),
      ranking: 2,
      datosCompletos: false,
    },
  ],
  resultados: [
    {
      primaCotizadaId: 'pc-a',
      escenario: {
        id: 'e2',
        codigo: 'ROBO_TOTAL',
        nombre: 'Robo total',
        orden: 2,
      },
      sinDato: true,
      cubre: null,
      probabilidad: d('0.01'),
      deducible: d(0),
      noCubierto: d(0),
      ingresoPerdido: d(0),
      desembolso: d(0),
    },
    {
      primaCotizadaId: 'pc-a',
      escenario: {
        id: 'e1',
        codigo: 'CHOQUE_LEVE',
        nombre: 'Choque leve',
        orden: 1,
      },
      sinDato: false,
      cubre: true,
      probabilidad: d('0.20'),
      deducible: d(150),
      noCubierto: d(0),
      ingresoPerdido: d(0),
      desembolso: d(150),
    },
    {
      primaCotizadaId: 'pc-b',
      escenario: {
        id: 'e1',
        codigo: 'CHOQUE_LEVE',
        nombre: 'Choque leve',
        orden: 1,
      },
      sinDato: false,
      cubre: true,
      probabilidad: d('0.20'),
      deducible: d(100),
      noCubierto: d(0),
      ingresoPerdido: d(0),
      desembolso: d(100),
    },
    {
      primaCotizadaId: 'pc-b',
      escenario: {
        id: 'e2',
        codigo: 'ROBO_TOTAL',
        nombre: 'Robo total',
        orden: 2,
      },
      sinDato: false,
      cubre: true,
      probabilidad: d('0.01'),
      deducible: d(3000),
      noCubierto: d(0),
      ingresoPerdido: d(0),
      desembolso: d(3000),
    },
  ],
});

const PERFIL = { estacionaCochera: true, kmMesAlto: false, usoNocturno: false };

function crear(cot: CotizacionGuardada | null = cotizacion()) {
  const registrados: { s: SimulacionParaGuardar; token?: string }[] = [];
  const repo: PruebaChoqueRepository = {
    escenariosActivos: () => Promise.resolve(catalogo().escenarios),
    probabilidadesReferenciales: () =>
      Promise.resolve(new Map([['e1', d('0.2')]])),
    catalogo: () => Promise.resolve(catalogo()),
    registrar: (_id, s, token) => {
      registrados.push({ s, token });
      return Promise.resolve({ simulacionId: 'sim-1' });
    },
    ultima: () => Promise.resolve(guardada()),
  };
  const cotizaciones = {
    obtener: () => Promise.resolve(cot),
  } as unknown as CotizacionRepository;
  return {
    service: new PruebaChoqueService(repo, cotizaciones),
    registrados,
    repo,
  };
}

describe('PruebaChoqueService.simular', () => {
  it('simula solo las primas disponibles y guarda montos como texto, sin el ingreso en uso particular (RN-33)', async () => {
    const { service, registrados } = crear();
    const r = await service.simular(
      'cot-1',
      { ...PERFIL, ingresoDiarioSoles: '200' },
      'jwt',
    );

    const { s, token } = registrados[0]!;
    expect(token).toBe('jwt');
    expect(s.perfil).toEqual({
      ...PERFIL,
      ingresoDiarioSoles: null,
      preocupaciones: [],
    });
    expect(s.planes.map((p) => p.primaCotizadaId).sort()).toEqual([
      'pc-a',
      'pc-b',
    ]);
    expect(s.resultados).toHaveLength(4);
    expect(s.zona).toBe('BAJA');
    expect(s.versionReglas).toMatch(/^[0-9a-f]{12}$/);
    // plan-a sin regla de robo total → sinDato
    expect(
      s.resultados.find(
        (x) => x.primaCotizadaId === 'pc-a' && x.escenarioId === 'e2',
      )!.sinDato,
    ).toBe(true);
    expect(r.warning).toEqual({
      code: 'DATOS_COBERTURA_INCOMPLETOS',
      message: 'No tenemos información de robo total para 1 plan.',
    });
  });

  it('guarda el ingreso diario en uso comercial', async () => {
    const cot = cotizacion();
    cot.vehiculo.uso = 'COMERCIAL_LIGERO';
    const { service, registrados } = crear(cot);
    await service.simular('cot-1', { ...PERFIL, ingresoDiarioSoles: '150.5' });
    expect(registrados[0]!.s.perfil.ingresoDiarioSoles).toBe('150.50');
    expect(registrados[0]!.token).toBeUndefined();
  });

  it('404 si la cotización no existe', async () => {
    await expect(
      crear(null).service.simular('x', PERFIL),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('400 si la cotización no está REGISTRADA (§13.1)', async () => {
    const { service } = crear(cotizacion({ estado: 'NO_CONCRETADA' }));
    await expect(service.simular('cot-1', PERFIL)).rejects.toThrow(
      'Esta cotización ya no se puede simular',
    );
  });

  it('400 si no hay primas disponibles', async () => {
    const { service } = crear(cotizacion({ primas: [] }));
    await expect(service.simular('cot-1', PERFIL)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('400 si una preocupación no es un escenario', async () => {
    const { service } = crear();
    await expect(
      service.simular('cot-1', { ...PERFIL, preocupaciones: ['TERREMOTO'] }),
    ).rejects.toThrow('La preocupación TERREMOTO no existe');
  });
});

describe('PruebaChoqueService lecturas', () => {
  it('escenarios sin uso no trae probabilidad; con uso sí', async () => {
    const { service } = crear();
    const sin = await service.escenarios();
    expect(sin[0]).not.toHaveProperty('probabilidadReferencial');
    expect(sin[1]!.montoDanoReferencial).toBeNull();
    const con = await service.escenarios('PARTICULAR');
    expect(con.map((e) => e.probabilidadReferencial)).toEqual([
      '0.2000',
      '0.0000',
    ]);
  });

  it('ultima: 404 cuando no hay simulación', async () => {
    const { service, repo } = crear();
    repo.ultima = () => Promise.resolve(null);
    await expect(service.ultima('cot-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('vista de la simulación', () => {
  it('ordena por ranking y escenario, separa prima y esperado, y no expone el perfil (RN-36)', () => {
    const r = armarRespuesta(guardada());
    expect(r.ranking.map((p) => p.primaCotizadaId)).toEqual(['pc-b', 'pc-a']);
    // B: esperado = .2·100 + .01·3000 = 50 → prima 701
    expect(r.ranking[0]).toMatchObject({
      desembolsoEsperado: '50.00',
      prima: '701.00',
      costoRealAnual: '751.00',
      posicion: 1,
    });
    // A: sinDato excluido → esperado 30, prima 500
    expect(r.ranking[1]).toMatchObject({
      desembolsoEsperado: '30.00',
      prima: '500.00',
      datosCompletos: false,
    });
    expect(r.matriz.map((m) => m.escenario.codigo)).toEqual([
      'CHOQUE_LEVE',
      'ROBO_TOTAL',
    ]);
    expect(r.matriz[1]!.resultados.map((x) => x.primaCotizadaId)).toEqual([
      'pc-b',
      'pc-a',
    ]);
    expect(r.matriz[0]!.escenario.probabilidad).toBe('0.2000');
    expect(r.leyenda).toContain('Prevalece el condicionado');
    expect(JSON.stringify(r)).not.toContain('perfil');
  });

  it('sin datos faltantes no hay warning', () => {
    const s = guardada();
    s.resultados = s.resultados.filter((x) => !x.sinDato);
    expect(warningIncompletos(s)).toBeUndefined();
  });

  it('versionReglas no depende del orden de las reglas', () => {
    const a = catalogo();
    const b = catalogo();
    b.reglas.reverse();
    expect(versionReglas(a)).toBe(versionReglas(b));
  });
});
