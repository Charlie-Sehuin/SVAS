import { BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { EstrategiaRegistry } from '../../integracion/estrategias/estrategia.registry';
import { PasarelaSimuladaAdapter } from '../../integracion/pagos/pasarela-simulada.adapter';
import type { PlanTarifa } from '../cotizacion/domain/tarifa.types';
import { ProcesarPagoService } from './application/procesar-pago.service';
import { montoTotalPago, validarCuotas } from './domain/monto-pago';
import type { PasarelaPago } from './domain/pasarela-pago.port';

const D = (v: string) => new Decimal(v);
const registro = new EstrategiaRegistry();
const planLaPositiva: PlanTarifa = {
  planId: 'lp-full',
  nombre: 'Full',
  tasaBase: D('0.0400'),
  parametros: { recargo_pago_mensual: 0.05 },
};
const planRimac: PlanTarifa = {
  planId: 'rimac-oro',
  nombre: 'Oro',
  tasaBase: D('0.0400'),
  parametros: {},
};

describe('pagos · montoTotalPago (RN-38)', () => {
  it('al contado es la prima final', () => {
    expect(
      montoTotalPago(
        registro.obtener('LA_POSITIVA'),
        D('619.20'),
        planLaPositiva,
        'UNICO',
      ).toFixed(2),
    ).toBe('619.20');
  });

  it('en cuotas La Positiva suma el 5 % (§17.8: 619.20 → 650.16)', () => {
    expect(
      montoTotalPago(
        registro.obtener('LA_POSITIVA'),
        D('619.20'),
        planLaPositiva,
        'CUOTAS',
      ).toFixed(2),
    ).toBe('650.16');
  });

  it('en cuotas las demás aseguradoras no recargan', () => {
    expect(
      montoTotalPago(
        registro.obtener('RIMAC'),
        D('665.00'),
        planRimac,
        'CUOTAS',
      ).toFixed(2),
    ).toBe('665.00');
  });
});

describe('pagos · validarCuotas (RN-14)', () => {
  it.each([
    ['UNICO', undefined, null],
    ['UNICO', 3, 'El pago al contado no lleva número de cuotas'],
    ['CUOTAS', undefined, 'Indica en cuántas cuotas quieres pagar'],
    ['CUOTAS', 1, 'Puedes pagar de 2 a 12 cuotas'],
    ['CUOTAS', 13, 'Puedes pagar de 2 a 12 cuotas'],
    ['CUOTAS', 2.5, 'Puedes pagar de 2 a 12 cuotas'],
    ['CUOTAS', 2, null],
    ['CUOTAS', 12, null],
  ] as const)('%s con %s cuotas → %s', (modo, n, esperado) => {
    expect(validarCuotas(modo, n, 12)).toBe(esperado);
  });
});

describe('pagos · ProcesarPagoService', () => {
  const crear = (pasarela: PasarelaPago = new PasarelaSimuladaAdapter()) =>
    new ProcesarPagoService(pasarela, registro);
  const base = {
    ordenId: 'orden-1',
    codigoEstrategia: 'LA_POSITIVA',
    plan: planLaPositiva,
    maxCuotas: 12,
    idempotencyKey: 'clave-1',
  };

  it('cobra en cuotas con el recargo y devuelve el total cobrado', async () => {
    const r = await crear().cobrar({
      ...base,
      primaFinal: D('619.20'),
      modo: 'CUOTAS',
      numeroCuotas: 12,
    });
    expect(r).toMatchObject({
      estado: 'APROBADO',
      modo: 'CUOTAS',
      numeroCuotas: 12,
    });
    expect(r.montoTotal.toFixed(2)).toBe('650.16');
    expect(r.referencia).toMatch(/^SIM-/);
  });

  it('pasa a la pasarela el monto, el modo, las cuotas y la clave', async () => {
    const cobrar = jest
      .fn()
      .mockResolvedValue({ estado: 'APROBADO', referencia: 'R' });
    await crear({ cobrar }).cobrar({
      ...base,
      primaFinal: D('619.20'),
      modo: 'CUOTAS',
      numeroCuotas: 6,
    });
    const llamada = cobrar.mock.calls[0][0];
    expect(llamada).toMatchObject({
      ordenId: 'orden-1',
      modo: 'CUOTAS',
      cuotas: 6,
      idempotencyKey: 'clave-1',
    });
    expect(llamada.monto.toFixed(2)).toBe('650.16');
  });

  it('al contado no manda cuotas', async () => {
    const cobrar = jest
      .fn()
      .mockResolvedValue({ estado: 'APROBADO', referencia: 'R' });
    const r = await crear({ cobrar }).cobrar({
      ...base,
      primaFinal: D('619.20'),
      modo: 'UNICO',
    });
    expect(cobrar.mock.calls[0][0]).not.toHaveProperty('cuotas');
    expect(r.numeroCuotas).toBeNull();
    expect(r.montoTotal.toFixed(2)).toBe('619.20');
  });

  it('devuelve RECHAZADO cuando el total termina en .13', async () => {
    const r = await crear().cobrar({
      ...base,
      codigoEstrategia: 'RIMAC',
      plan: planRimac,
      primaFinal: D('619.13'),
      modo: 'UNICO',
    });
    expect(r.estado).toBe('RECHAZADO');
  });

  it('valida las cuotas antes de llamar a la pasarela', async () => {
    const cobrar = jest.fn();
    await expect(
      crear({ cobrar }).cobrar({
        ...base,
        primaFinal: D('619.20'),
        modo: 'CUOTAS',
        numeroCuotas: 13,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(cobrar).not.toHaveBeenCalled();
  });
});
