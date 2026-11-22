import { diasHasta, hoyEnLima } from './fecha.util';

describe('fecha.util', () => {
  it('hoyEnLima usa el día de Lima, no el UTC', () => {
    // 2026-11-21 23:30 en Lima (UTC-5) = 2026-11-22 04:30 UTC.
    expect(hoyEnLima(new Date('2026-11-22T04:30:00Z'))).toBe('2026-11-21');
    expect(hoyEnLima(new Date('2026-11-22T05:30:00Z'))).toBe('2026-11-22');
  });

  it('diasHasta cuenta días de calendario: 0 hoy, negativo si ya pasó', () => {
    expect(diasHasta('2026-11-22', '2026-11-22')).toBe(0);
    expect(diasHasta('2026-11-25', '2026-11-22')).toBe(3);
    expect(diasHasta('2026-11-20', '2026-11-22')).toBe(-2);
  });

  it('diasHasta cruza meses y años sin errores', () => {
    expect(diasHasta('2027-01-01', '2026-12-31')).toBe(1);
    expect(diasHasta('2026-03-01', '2026-02-28')).toBe(1);
  });
});
