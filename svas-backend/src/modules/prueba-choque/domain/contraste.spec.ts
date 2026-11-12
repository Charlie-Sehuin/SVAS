import Decimal from 'decimal.js';
import {
  contrasteRetencion,
  esperadoPorPlan,
  fraseContraste,
  textoUsd,
} from './contraste';
import type { SimulacionGuardada } from './prueba-choque.repository.port';

const D = (v: string | number) => new Decimal(v);
const ROBO = {
  id: 'e1',
  codigo: 'ROBO_AUTOPARTES',
  nombre: 'Robo de autopartes',
  orden: 1,
};
const CHOQUE = {
  id: 'e2',
  codigo: 'CHOQUE_LEVE',
  nombre: 'Choque leve',
  orden: 2,
};

/**
 * Tres planes. Primas (CRA − esperado): barato 500, medio 600, caro 700.
 * Desembolsos: robo 1200 / 150 / 100; choque 300 / 400 / 300.
 */
function simulacion(
  cambios: Partial<SimulacionGuardada> = {},
): SimulacionGuardada {
  const res = (
    p: string,
    e: typeof ROBO,
    desembolso: number,
    prob = '0.1000',
    sinDato = false,
  ) => ({
    primaCotizadaId: p,
    escenario: e,
    sinDato,
    cubre: sinDato ? null : true,
    probabilidad: D(prob),
    deducible: D(0),
    noCubierto: D(0),
    ingresoPerdido: D(0),
    desembolso: D(desembolso),
  });
  const resultados = [
    res('barato', ROBO, 1200),
    res('barato', CHOQUE, 300),
    res('medio', ROBO, 150),
    res('medio', CHOQUE, 400),
    res('caro', ROBO, 100),
    res('caro', CHOQUE, 300),
  ];
  const s: SimulacionGuardada = {
    id: 's1',
    zona: 'ALTA',
    fecha: '2026-11-12T10:00:00Z',
    vigente: true,
    planes: [],
    resultados,
    ...cambios,
  };
  const esp = esperadoPorPlan(s);
  const plan = (id: string, prima: number, ranking: number) => ({
    primaCotizadaId: id,
    aseguradora: { barato: 'Rímac', medio: 'Pacífico', caro: 'Mapfre' }[id]!,
    plan: { barato: 'Plata', medio: 'Premium', caro: 'Total' }[id]!,
    costoRealAnual: D(prima).plus(esp.get(id) ?? 0),
    peorCaso: D(0),
    ranking,
    datosCompletos: true,
  });
  return {
    ...s,
    planes: cambios.planes ?? [
      plan('medio', 600, 1),
      plan('barato', 500, 2),
      plan('caro', 700, 3),
    ],
  };
}

describe('prueba-choque · contraste RN-35', () => {
  it('esperado = Σ probabilidad × desembolso, a 2 decimales', () => {
    expect(esperadoPorPlan(simulacion()).get('barato')!.toFixed(2)).toBe(
      '150.00',
    );
  });

  it('elige el escenario con la mayor diferencia frente al plan más barato', () => {
    const c = contrasteRetencion(simulacion())!;
    // robo: 1200 − 100 (caro) = 1100 > 1200 − 150 (medio) = 1050
    expect(c.escenario).toBe('Robo de autopartes');
    expect(c.barato).toMatchObject({ aseguradora: 'Rímac', plan: 'Plata' });
    expect(c.otro).toMatchObject({ aseguradora: 'Mapfre', plan: 'Total' });
    expect(c.otro.desembolso.toFixed(2)).toBe('100.00');
  });

  it('arma la frase con montos en USD', () => {
    expect(fraseContraste(contrasteRetencion(simulacion())!)).toBe(
      'Con el plan más barato (Rímac Plata) pagarías USD 1,200.00 de tu bolsillo ' +
        'en un caso de robo de autopartes; con Mapfre Total, USD 100.00.',
    );
    expect(textoUsd(D('1234567.5'))).toBe('USD 1,234,567.50');
  });

  it('ignora escenarios sin dato (RN-30)', () => {
    const resultados = simulacion().resultados.map((r) =>
      r.primaCotizadaId === 'caro' && r.escenario.id === 'e1'
        ? { ...r, sinDato: true, cubre: null }
        : r,
    );
    expect(
      contrasteRetencion(simulacion({ resultados }))!.otro.aseguradora,
    ).toBe('Pacífico');
  });

  it('null si la simulación no está vigente (RN-37)', () => {
    expect(contrasteRetencion(simulacion({ vigente: false }))).toBeNull();
  });

  it('null si el plan más barato nunca sale peor', () => {
    // Las primas se recalculan desde la instantánea: el barato sigue siendo el barato.
    const resultados = simulacion().resultados.map((r) =>
      r.primaCotizadaId === 'barato' ? { ...r, desembolso: D(0) } : r,
    );
    expect(contrasteRetencion(simulacion({ resultados }))).toBeNull();
  });

  it('null con un solo plan', () => {
    const s = simulacion();
    expect(
      contrasteRetencion({ ...s, planes: s.planes.slice(0, 1) }),
    ).toBeNull();
  });
});
