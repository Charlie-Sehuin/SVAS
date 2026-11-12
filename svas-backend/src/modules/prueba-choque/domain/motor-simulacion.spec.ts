import Decimal from 'decimal.js';
import {
  type EntradaMotor,
  type EscenarioMotor,
  type PrimaMotor,
  type ReglaMotor,
  ordenar,
  probabilidadAjustada,
  simular,
} from './motor-simulacion';

const d = (v: Decimal.Value) => new Decimal(v);

const LEVE: EscenarioMotor = {
  id: 'leve',
  codigo: 'CHOQUE_LEVE',
  montoDano: d(600),
  diasTaller: 3,
};
const AUTOPARTES: EscenarioMotor = {
  id: 'auto',
  codigo: 'ROBO_AUTOPARTES',
  montoDano: d(900),
  diasTaller: 2,
};
const ROBO: EscenarioMotor = {
  id: 'robo',
  codigo: 'ROBO_TOTAL',
  montoDano: null,
  diasTaller: 30,
};
const TERCEROS: EscenarioMotor = {
  id: 'rc',
  codigo: 'DANO_TERCEROS',
  montoDano: d(2500),
  diasTaller: 0,
};

const primaA: PrimaMotor = {
  primaCotizadaId: 'A',
  planId: 'pA',
  prima: d(480),
  sumaAsegurada: d(15000),
};
const primaB: PrimaMotor = {
  primaCotizadaId: 'B',
  planId: 'pB',
  prima: d(560),
  sumaAsegurada: d(15000),
};

const regla = (
  planId: string,
  escenarioId: string,
  r: Partial<ReglaMotor> = {},
): ReglaMotor => ({
  planId,
  escenarioId,
  cubre: true,
  deduciblePct: d(10),
  deducibleMinimo: d(150),
  tope: null,
  diasReemplazo: 0,
  ...r,
});

function entrada(e: Partial<EntradaMotor> = {}): EntradaMotor {
  return {
    uso: 'PARTICULAR',
    primas: [primaA],
    escenarios: [LEVE],
    reglas: [regla('pA', 'leve')],
    probabilidades: new Map([
      ['leve', d('0.2')],
      ['auto', d('0.12')],
      ['robo', d('0.01')],
      ['rc', d('0.06')],
    ]),
    factores: [],
    perfil: {
      estacionaCochera: false,
      kmMesAlto: false,
      usoNocturno: false,
      ingresoDiarioSoles: null,
    },
    tipoCambio: d('3.75'),
    ...e,
  };
}

const unico = (e: EntradaMotor) => simular(e).resultados[0]!;

describe('motor de la Prueba de Choque (§16.3)', () => {
  describe('deducible', () => {
    it('usa el mínimo cuando el porcentaje da menos', () => {
      // 10 % de 600 = 60 < 150
      const r = unico(entrada());
      expect(r.deducible.toFixed(2)).toBe('150.00');
      expect(r.cubierto.toFixed(2)).toBe('450.00');
      expect(r.desembolso.toFixed(2)).toBe('150.00');
    });

    it('usa el porcentaje cuando supera el mínimo', () => {
      const r = unico(
        entrada({ reglas: [regla('pA', 'leve', { deduciblePct: d(40) })] }),
      );
      expect(r.deducible.toFixed(2)).toBe('240.00');
    });

    it('nunca supera el daño', () => {
      const r = unico(
        entrada({
          reglas: [regla('pA', 'leve', { deducibleMinimo: d(1000) })],
        }),
      );
      expect(r.deducible.toFixed(2)).toBe('600.00');
      expect(r.cubierto.toFixed(2)).toBe('0.00');
    });

    it('sin porcentaje ni mínimo, el deducible es 0', () => {
      const r = unico(
        entrada({
          reglas: [
            regla('pA', 'leve', { deduciblePct: null, deducibleMinimo: null }),
          ],
        }),
      );
      expect(r.desembolso.toFixed(2)).toBe('0.00');
    });
  });

  it('si no cubre, el cliente paga todo el daño', () => {
    const r = unico(
      entrada({
        escenarios: [AUTOPARTES],
        reglas: [
          regla('pA', 'auto', {
            cubre: false,
            deduciblePct: null,
            deducibleMinimo: null,
          }),
        ],
      }),
    );
    expect(r.cubre).toBe(false);
    expect(r.noCubierto.toFixed(2)).toBe('900.00');
    expect(r.desembolso.toFixed(2)).toBe('900.00');
  });

  it('lo que pasa del tope lo paga el cliente', () => {
    const r = unico(
      entrada({
        escenarios: [TERCEROS],
        reglas: [
          regla('pA', 'rc', {
            deduciblePct: d(0),
            deducibleMinimo: d(0),
            tope: d(1000),
          }),
        ],
      }),
    );
    expect(r.noCubierto.toFixed(2)).toBe('1500.00');
    expect(r.cubierto.toFixed(2)).toBe('1000.00');
    expect(r.desembolso.toFixed(2)).toBe('1500.00');
  });

  it('el desembolso nunca supera el daño aunque haya deducible y tope', () => {
    const r = unico(
      entrada({
        escenarios: [TERCEROS],
        reglas: [
          regla('pA', 'rc', {
            deduciblePct: d(0),
            deducibleMinimo: d(800),
            tope: d(1000),
          }),
        ],
      }),
    );
    expect(r.desembolso.toFixed(2)).toBe('2300.00'); // 800 + 1500
    expect(r.desembolso.lte(r.dano)).toBe(true);
  });

  it('ROBO_TOTAL usa como daño la suma asegurada de la prima', () => {
    const r = unico(
      entrada({
        escenarios: [ROBO],
        reglas: [
          regla('pA', 'robo', { deduciblePct: d(20), deducibleMinimo: d(500) }),
        ],
      }),
    );
    expect(r.dano.toFixed(2)).toBe('15000.00');
    expect(r.deducible.toFixed(2)).toBe('3000.00');
  });

  describe('probabilidad', () => {
    it('multiplica solo los factores de las respuestas "sí"', () => {
      const e = entrada({
        perfil: {
          estacionaCochera: true,
          kmMesAlto: false,
          usoNocturno: true,
          ingresoDiarioSoles: null,
        },
        factores: [
          {
            escenarioId: 'auto',
            variable: 'ESTACIONA_COCHERA',
            multiplicador: d('0.5'),
          },
          {
            escenarioId: 'auto',
            variable: 'USO_NOCTURNO',
            multiplicador: d('1.3'),
          },
          {
            escenarioId: 'auto',
            variable: 'KM_MES_ALTO',
            multiplicador: d('2'),
          },
        ],
      });
      expect(probabilidadAjustada(e, 'auto').toFixed(4)).toBe('0.0780'); // 0.12 × 0.5 × 1.3
    });

    it('se acota a 0,95', () => {
      const e = entrada({
        perfil: {
          estacionaCochera: false,
          kmMesAlto: true,
          usoNocturno: false,
          ingresoDiarioSoles: null,
        },
        probabilidades: new Map([['leve', d('0.8')]]),
        factores: [
          { escenarioId: 'leve', variable: 'KM_MES_ALTO', multiplicador: d(3) },
        ],
      });
      expect(probabilidadAjustada(e, 'leve').toFixed(4)).toBe('0.9500');
    });

    it('escenario sin frecuencia → probabilidad 0', () => {
      expect(
        probabilidadAjustada(
          entrada({ probabilidades: new Map() }),
          'leve',
        ).toFixed(4),
      ).toBe('0.0000');
    });
  });

  describe('ingreso perdido (RN-33)', () => {
    const comercial = (
      ingreso: Decimal | null,
      uso: EntradaMotor['uso'] = 'COMERCIAL_LIGERO',
      reemplazo = 0,
    ) =>
      unico(
        entrada({
          uso,
          escenarios: [LEVE],
          reglas: [regla('pA', 'leve', { diasReemplazo: reemplazo })],
          perfil: {
            estacionaCochera: false,
            kmMesAlto: false,
            usoNocturno: false,
            ingresoDiarioSoles: ingreso,
          },
        }),
      );

    it('uso comercial con ingreso: días de taller × ingreso en USD', () => {
      // S/ 150 / 3.75 = USD 40 × 3 días = 120
      const r = comercial(d(150));
      expect(r.ingresoPerdido.toFixed(2)).toBe('120.00');
      expect(r.desembolso.toFixed(2)).toBe('270.00');
    });

    it('los días de auto de reemplazo se descuentan', () => {
      expect(
        comercial(d(150), 'TRANSPORTE_PASAJEROS', 2).ingresoPerdido.toFixed(2),
      ).toBe('40.00');
      expect(
        comercial(d(150), 'TRANSPORTE_PASAJEROS', 10).ingresoPerdido.toFixed(2),
      ).toBe('0.00');
    });

    it('particular o sin ingreso declarado: 0', () => {
      expect(comercial(d(150), 'PARTICULAR').ingresoPerdido.toFixed(2)).toBe(
        '0.00',
      );
      expect(comercial(null).ingresoPerdido.toFixed(2)).toBe('0.00');
      expect(comercial(d(0)).ingresoPerdido.toFixed(2)).toBe('0.00');
    });

    it('si no cubre, el reemplazo no aplica', () => {
      const r = unico(
        entrada({
          uso: 'COMERCIAL_LIGERO',
          reglas: [
            regla('pA', 'leve', {
              cubre: false,
              deduciblePct: null,
              deducibleMinimo: null,
              diasReemplazo: 0,
            }),
          ],
          perfil: {
            estacionaCochera: false,
            kmMesAlto: false,
            usoNocturno: false,
            ingresoDiarioSoles: d('37.5'),
          },
        }),
      );
      expect(r.ingresoPerdido.toFixed(2)).toBe('30.00'); // 10 × 3
    });
  });

  describe('CRA, peor caso y ranking', () => {
    it('CRA = prima + Σ probabilidad × desembolso; peor caso = máximo desembolso', () => {
      const s = simular(
        entrada({
          escenarios: [LEVE, AUTOPARTES],
          reglas: [
            regla('pA', 'leve'),
            regla('pA', 'auto', {
              deduciblePct: d(15),
              deducibleMinimo: d(300),
            }),
          ],
        }),
      );
      // 0.2 × 150 + 0.12 × 300 = 30 + 36 = 66
      expect(s.planes[0]!.desembolsoEsperado.toFixed(2)).toBe('66.00');
      expect(s.planes[0]!.costoRealAnual.toFixed(2)).toBe('546.00');
      expect(s.planes[0]!.peorCaso.toFixed(2)).toBe('300.00');
      expect(s.resultados).toHaveLength(2);
    });

    it('un plan más caro de prima puede quedar primero por CRA', () => {
      // A: no cubre autopartes (paga 900); B sí (deducible 150).
      const s = simular(
        entrada({
          primas: [primaA, primaB],
          escenarios: [AUTOPARTES],
          reglas: [
            regla('pA', 'auto', {
              cubre: false,
              deduciblePct: null,
              deducibleMinimo: null,
            }),
            regla('pB', 'auto'),
          ],
          probabilidades: new Map([['auto', d('0.18')]]),
        }),
      );
      // A = 480 + 0.18 × 900 = 642 ; B = 560 + 0.18 × 150 = 587
      expect(
        s.planes.map((p) => [
          p.primaCotizadaId,
          p.costoRealAnual.toFixed(2),
          p.ranking,
        ]),
      ).toEqual([
        ['B', '587.00', 1],
        ['A', '642.00', 2],
      ]);
    });

    it('RN-30: sin regla el escenario queda "sin dato" y el plan nunca es el primero', () => {
      const s = simular(
        entrada({
          primas: [primaA, primaB],
          escenarios: [LEVE, ROBO],
          // A no tiene regla de robo total → su CRA sería menor, pero queda último.
          reglas: [
            regla('pA', 'leve'),
            regla('pB', 'leve'),
            regla('pB', 'robo'),
          ],
        }),
      );
      const a = s.planes.find((p) => p.primaCotizadaId === 'A')!;
      expect(a.datosCompletos).toBe(false);
      expect(a.ranking).toBe(2);
      expect(a.costoRealAnual.toFixed(2)).toBe('510.00'); // 480 + 0.2 × 150, sin robo
      const sinDato = s.resultados.find(
        (r) => r.primaCotizadaId === 'A' && r.escenarioId === 'robo',
      )!;
      expect(sinDato).toMatchObject({ sinDato: true, cubre: null });
      expect(sinDato.desembolso.toFixed(2)).toBe('0.00');
    });

    it('empate de CRA → gana la menor prima', () => {
      const p = (id: string, prima: number, cra: number) => ({
        primaCotizadaId: id,
        prima: d(prima),
        desembolsoEsperado: d(cra - prima),
        costoRealAnual: d(cra),
        peorCaso: d(0),
        datosCompletos: true,
      });
      expect(
        ordenar([p('X', 600, 700), p('Y', 500, 700), p('Z', 400, 650)]).map(
          (x) => x.primaCotizadaId,
        ),
      ).toEqual(['Z', 'Y', 'X']);
    });
  });
});
