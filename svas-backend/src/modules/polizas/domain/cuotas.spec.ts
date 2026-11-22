import { aCuotasResumen } from './cuotas';

const c = (
  numero: number,
  monto: string | number,
  estado: 'PENDIENTE' | 'CONFIRMADO',
  fecha: string,
) => ({ numero, monto, fechaVencimiento: fecha, estado });

describe('aCuotasResumen', () => {
  const cuotas = [
    c(4, '54.17', 'PENDIENTE', '2027-02-12'),
    c(1, 54.18, 'CONFIRMADO', '2026-11-12'),
    c(3, '54.18', 'PENDIENTE', '2027-01-12'),
    c(2, '54.18', 'PENDIENTE', '2026-12-12'),
  ];

  it('ordena por número y da el monto con dos decimales', () => {
    const r = aCuotasResumen(cuotas, '2026-11-22');
    expect(r.map((x) => x.numero)).toEqual([1, 2, 3, 4]);
    expect(r.map((x) => x.monto)).toEqual(['54.18', '54.18', '54.18', '54.17']);
  });

  it('acumula solo las pendientes, en orden, sin errores de decimales', () => {
    const r = aCuotasResumen(cuotas, '2026-11-22');
    expect(r.map((x) => x.montoAcumulado)).toEqual([
      null,
      '54.18',
      '108.36',
      '162.53',
    ]);
  });

  it('las pagadas no llevan días ni acumulado', () => {
    const [pagada] = aCuotasResumen(cuotas, '2026-11-22');
    expect(pagada).toMatchObject({
      estado: 'CONFIRMADO',
      diasParaVencer: null,
      montoAcumulado: null,
    });
  });

  it('los días para vencer son de calendario: 0 hoy, negativo si ya venció', () => {
    const r = aCuotasResumen(cuotas, '2026-12-14');
    expect(r.find((x) => x.numero === 2)!.diasParaVencer).toBe(-2);
    expect(r.find((x) => x.numero === 3)!.diasParaVencer).toBe(29);
    expect(
      aCuotasResumen(cuotas, '2026-12-12').find((x) => x.numero === 2)!
        .diasParaVencer,
    ).toBe(0);
  });

  it('sin cuotas devuelve una lista vacía', () => {
    expect(aCuotasResumen([], '2026-11-22')).toEqual([]);
  });
});
