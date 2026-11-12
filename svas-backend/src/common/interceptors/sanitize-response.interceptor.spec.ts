import Decimal from 'decimal.js';
import { sanitizar } from './sanitize-response.interceptor';

describe('sanitizar', () => {
  const respuesta = {
    cotizacion: {
      id: 'c1',
      token_acceso_hash: 'abc',
      tokenAcceso: 'se-entrega-una-vez',
      primas: [
        { plan: 'Oro', prima: '850.00', detalleCalculo: { tasa: '0.035' } },
        { plan: 'Plata', prima: '600.00', detalle_calculo: { tasa: '0.03' } },
      ],
    },
    seguimiento: { enlace_token: 'secreto', enlaceTokenHash: 'h' },
    fecha: new Date('2026-01-01T00:00:00Z'),
    monto: new Decimal('10.50'),
  };

  it('elimina hashes y el enlace de retoma, conserva tokenAcceso', () => {
    const r = sanitizar(respuesta, true) as typeof respuesta;
    expect(r.cotizacion).not.toHaveProperty('token_acceso_hash');
    expect(r.cotizacion.tokenAcceso).toBe('se-entrega-una-vez');
    expect(r.seguimiento).toEqual({});
  });

  it('quita el desglose de la prima a CLIENTE', () => {
    const r = sanitizar(respuesta, false) as typeof respuesta;
    expect(r.cotizacion.primas).toEqual([
      { plan: 'Oro', prima: '850.00' },
      { plan: 'Plata', prima: '600.00' },
    ]);
  });

  it('mantiene el desglose para ASESOR/ADMINISTRADOR', () => {
    const r = sanitizar(respuesta, true) as typeof respuesta;
    expect(r.cotizacion.primas[0].detalleCalculo).toEqual({ tasa: '0.035' });
  });

  it('no toca Date ni Decimal ni primitivos', () => {
    const r = sanitizar(respuesta, true) as typeof respuesta;
    expect(r.fecha).toBeInstanceOf(Date);
    expect(r.monto).toBeInstanceOf(Decimal);
    expect(sanitizar('texto', false)).toBe('texto');
    expect(sanitizar(null, false)).toBeNull();
  });
});
