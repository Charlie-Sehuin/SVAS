import Decimal from 'decimal.js';
import { SumaFueraDeRangoException } from '../../modules/cotizacion/domain/suma-fuera-de-rango.exception';
import type {
  TarifaAseguradora,
  VehiculoCotizable,
} from '../../modules/cotizacion/domain/tarifa.types';
import { sumaInicial } from './estrategia-base';
import { EstrategiaRegistry } from './estrategia.registry';

/**
 * Caso dorado (doc contexto §17.6): Toyota Corolla 2022 (Sedán), Miraflores.
 * Datos tomados del seed 0017 (Excel de trabajo).
 */
const D = (v: number | string) => new Decimal(v);
const COROLLA: VehiculoCotizable = {
  marcaId: 'toyota',
  modeloId: 'corolla',
  tipoId: 'sedan',
  anio: 2022,
  ubigeo: '150122',
};
const PICANTO: VehiculoCotizable = {
  marcaId: 'kia',
  modeloId: 'picanto',
  tipoId: 'hatchback',
  anio: 2015,
  ubigeo: '150101',
};

interface Datos {
  planes: [string, number, Record<string, unknown>][];
  rango: [number, number];
  marca: number;
  modelo: number;
  anio: number;
  tipo?: number;
  ubigeo?: number;
  picanto?: {
    rango: [number, number];
    marca: number;
    modelo: number;
    anio: number;
  };
}

const DATOS: Record<string, Datos> = {
  RIMAC: {
    planes: [
      ['Plata', 0.03, {}],
      ['Oro', 0.042, {}],
    ],
    rango: [12000, 16800],
    marca: 0.95,
    modelo: 1,
    anio: 1.07,
  },
  PACIFICO: {
    planes: [
      ['Básico', 0.028, { cargo_fijo_anual: 30 }],
      ['Premium', 0.04, { cargo_fijo_anual: 45 }],
    ],
    rango: [12700, 16500],
    marca: 0.97,
    modelo: 1,
    anio: 1,
    ubigeo: 0.98,
  },
  LA_POSITIVA: {
    planes: [
      ['Clásico', 0.03, { recargo_pago_mensual: 0.05 }],
      ['Full', 0.043, { recargo_pago_mensual: 0.05 }],
    ],
    rango: [12300, 16200],
    marca: 0.96,
    modelo: 1.02,
    anio: 1.032,
    tipo: 1,
  },
  MAPFRE: {
    planes: [
      ['Esencial', 0.029, { prima_minima_anual: 180 }],
      ['Total', 0.041, { prima_minima_anual: 250 }],
    ],
    rango: [12400, 16500],
    marca: 0.96,
    modelo: 1,
    anio: 1.034,
    picanto: { rango: [2600, 3400], marca: 1.01, modelo: 0.96, anio: 1.216 },
  },
  QUALITAS: {
    planes: [
      ['Estándar', 0.031, { descuento_comercial: 0.05 }],
      ['Plus', 0.044, { descuento_comercial: 0.05 }],
    ],
    rango: [11700, 15700],
    marca: 1,
    modelo: 1.02,
    anio: 1.02,
  },
};

function tarifa(
  codigo: string,
  cambios: Partial<TarifaAseguradora> = {},
): TarifaAseguradora {
  const d = DATOS[codigo];
  const t: TarifaAseguradora = {
    aseguradoraId: codigo,
    planes: d.planes.map(([nombre, tb, parametros]) => ({
      planId: nombre,
      nombre,
      tasaBase: D(tb),
      parametros,
    })),
    rangos: new Map([
      ['corolla:2022', { minima: D(d.rango[0]), maxima: D(d.rango[1]) }],
    ]),
    pesoMarca: new Map([['toyota', D(d.marca)]]),
    pesoModelo: new Map([['corolla', D(d.modelo)]]),
    pesoAnio: new Map([[2022, D(d.anio)]]),
    pesoTipo: new Map(d.tipo ? [['sedan', D(d.tipo)]] : []),
    pesoUbigeo: new Map(d.ubigeo ? [['150122', D(d.ubigeo)]] : []),
  };
  if (d.picanto) {
    t.rangos.set('picanto:2015', {
      minima: D(d.picanto.rango[0]),
      maxima: D(d.picanto.rango[1]),
    });
    t.pesoMarca.set('kia', D(d.picanto.marca));
    t.pesoModelo.set('picanto', D(d.picanto.modelo));
    t.pesoAnio.set(2015, D(d.picanto.anio));
  }
  return { ...t, ...cambios };
}

const registro = new EstrategiaRegistry();
const cotizar = (
  codigo: string,
  v = COROLLA,
  suma?: number,
  t = tarifa(codigo),
) =>
  registro
    .obtener(codigo)
    .cotizar(v, t, suma === undefined ? undefined : D(suma));

describe('Estrategias: tabla dorada §17.6 (Corolla 2022, Miraflores, S = 15 000)', () => {
  it.each([
    ['RIMAC', 'Plata', '457.43', '38.12'],
    ['RIMAC', 'Oro', '640.40', '53.37'],
    ['PACIFICO', 'Básico', '429.25', '35.77'],
    ['PACIFICO', 'Premium', '615.36', '51.28'],
    ['LA_POSITIVA', 'Clásico', '454.74', '39.79'],
    ['LA_POSITIVA', 'Full', '651.79', '57.03'],
    ['MAPFRE', 'Esencial', '431.80', '35.98'],
    ['MAPFRE', 'Total', '610.47', '50.87'],
    ['QUALITAS', 'Estándar', '447.64', '37.30'],
    ['QUALITAS', 'Plus', '635.36', '52.95'],
  ])('%s %s → prima %s, mensual %s', async (codigo, plan, prima, mensual) => {
    const r = (await cotizar(codigo, COROLLA, 15000)).find(
      (x) => x.planId === plan,
    )!;
    expect(r.disponible).toBe(true);
    expect(r.prima!.toFixed(2)).toBe(prima);
    expect(r.primaMensual!.toFixed(2)).toBe(mensual);
  });
});

describe('Suma inicial (RN-37, §17.7)', () => {
  it.each([
    ['RIMAC', '14400'],
    ['PACIFICO', '14600'],
    ['LA_POSITIVA', '14300'],
    ['MAPFRE', '14500'],
    ['QUALITAS', '13700'],
  ])('%s propone %s (punto medio a USD 100)', async (codigo, suma) => {
    const [r] = await cotizar(codigo);
    expect(r.sumaAsegurada!.toFixed(0)).toBe(suma);
  });

  it('Rímac con la suma inicial: Plata 439,13 (36,59) y Oro 614,78 (51,23)', async () => {
    const [plata, oro] = await cotizar('RIMAC');
    expect([plata.prima!.toFixed(2), plata.primaMensual!.toFixed(2)]).toEqual([
      '439.13',
      '36.59',
    ]);
    expect([oro.prima!.toFixed(2), oro.primaMensual!.toFixed(2)]).toEqual([
      '614.78',
      '51.23',
    ]);
  });

  it.each([
    [12000, '512.32', '42.69'],
    [13000, '555.01', '46.25'],
    [16800, '717.24', '59.77'],
  ])('Rímac Oro con S = %d → %s (%s)', async (suma, prima, mensual) => {
    const oro = (await cotizar('RIMAC', COROLLA, suma))[1];
    expect([oro.prima!.toFixed(2), oro.primaMensual!.toFixed(2)]).toEqual([
      prima,
      mensual,
    ]);
  });

  it('nunca propone una suma fuera del rango', () => {
    expect(sumaInicial({ minima: D(3460), maxima: D(3480) }).toFixed(0)).toBe(
      '3480',
    );
  });

  it('suma fuera del rango → 400 (no "no disponible")', async () => {
    await expect(cotizar('RIMAC', COROLLA, 20000)).rejects.toBeInstanceOf(
      SumaFueraDeRangoException,
    );
  });
});

describe('Particularidades de cada fórmula', () => {
  it('Mapfre: el piso manda en un Picanto 2015 (calculada 102,58 < 180)', async () => {
    const [esencial] = await cotizar('MAPFRE', PICANTO, 3000);
    expect(esencial.prima!.toFixed(2)).toBe('180.00');
    expect(esencial.detalleCalculo).toMatchObject({
      calculada: '102.5759232',
      aplicoMinima: true,
    });
    const [otraSuma] = await cotizar('MAPFRE', PICANTO, 3400);
    expect(otraSuma.prima!.toFixed(2)).toBe('180.00'); // prima "plana"
  });

  it('La Positiva: cuotas con recargo del 5 %', () => {
    const lp = registro.obtener('LA_POSITIVA');
    const plan = tarifa('LA_POSITIVA').planes[1];
    expect(lp.totalEnCuotas(D('619.20'), plan).toFixed(2)).toBe('650.16'); // §17.8
    expect(
      registro.obtener('RIMAC').totalEnCuotas(D('619.20'), plan).toFixed(2),
    ).toBe('619.20');
  });

  it('Pacífico: sin peso de ubigeo usa 1,00 y lo anota en el desglose', async () => {
    const [basico] = await cotizar(
      'PACIFICO',
      { ...COROLLA, ubigeo: '999999' },
      15000,
    );
    expect(basico.disponible).toBe(true);
    expect(basico.detalleCalculo).toMatchObject({ ubigeoPorDefecto: true });
    expect(
      (basico.detalleCalculo!.pesos as Record<string, string>).ubigeo,
    ).toBe('1.000');
  });
});

describe('RN-39: sin dato de tarifa no hay prima', () => {
  it('sin rango → SIN_RANGO en los dos planes', async () => {
    const r = await cotizar('RIMAC', { ...COROLLA, anio: 2010 });
    expect(r.map((x) => [x.disponible, x.motivoNoDisponible])).toEqual([
      [false, 'SIN_RANGO'],
      [false, 'SIN_RANGO'],
    ]);
  });

  it('falta un peso obligatorio → PESO_FALTANTE (nunca asume 1,00)', async () => {
    const sinTipo = tarifa('LA_POSITIVA', { pesoTipo: new Map() });
    const r = await cotizar('LA_POSITIVA', COROLLA, 15000, sinTipo);
    expect(r.every((x) => x.motivoNoDisponible === 'PESO_FALTANTE')).toBe(true);
  });

  it('el desglose guarda tasa base, pesos y pasos (RN-41)', async () => {
    const oro = (await cotizar('RIMAC', COROLLA, 15000))[1];
    expect(oro.detalleCalculo).toMatchObject({
      estrategia: 'RIMAC',
      sumaAsegurada: '15000.00',
      tasaBase: '0.0420',
      pesos: { marca: '0.950', modelo: '1.000', anio: '1.070' },
      tasa: '0.042693',
      primaAnual: '640.40',
    });
  });
});
