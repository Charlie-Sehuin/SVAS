import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { EstrategiaRegistry } from '../../integracion/estrategias/estrategia.registry';
import { PasarelaSimuladaAdapter } from '../../integracion/pagos/pasarela-simulada.adapter';
import { ProcesarPagoService } from '../pagos/application/procesar-pago.service';
import { COMPRA_NO_EXISTE } from './application/compra.service';
import {
  COMPRA_SIN_CUOTAS,
  COMPRA_SIN_PAGAR,
  CUOTAS_AL_DIA,
  PagarCuotasUseCase,
  vistaCuotasPagadas,
} from './application/pagar-cuotas.use-case';
import { PAGO_RECHAZADO } from './application/pagar-y-emitir.use-case';
import type { OrdenCompra, PagoOrden } from './domain/compra';
import type {
  CompraRepository,
  CuotasPagadas,
} from './domain/compra.repository.port';

const D = (v: string) => new Decimal(v);
const TOKEN = 'jwt-cliente';
const ORDEN = '33333333-3333-4333-8333-333333333333';

type Cuota = PagoOrden['cuotas'][number];

/** Cronograma de `n` cuotas de `monto` cada una: la 1 pagada al comprar, las demás pendientes. */
const cronograma = (n: number, monto = '50.00'): Cuota[] =>
  Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    monto: D(monto),
    fechaVencimiento: `2026-${String(11 + i).padStart(2, '0')}-12`,
    estado: i === 0 ? ('CONFIRMADO' as const) : ('PENDIENTE' as const),
    referencia: i === 0 ? 'SIM-COMPRA' : null,
    clave: null,
  }));

function ordenCon(pago: Partial<PagoOrden> | null): OrdenCompra {
  return {
    id: ORDEN,
    pagos: pago
      ? [
          {
            id: 'pago-1',
            modo: 'CUOTAS',
            monto: D('250.00'),
            numeroCuotas: 5,
            estado: 'CONFIRMADO',
            referencia: 'SIM-COMPRA',
            fecha: '2026-11-12T10:00:00Z',
            cuotas: cronograma(5),
            ...pago,
          },
        ]
      : [],
  } as unknown as OrdenCompra;
}

/** Repositorio en memoria que imita el RPC `pagar_cuotas` (0041): primeras N pendientes, en orden. */
class RepoFalso {
  cobros: { cantidad: number; monto: string; clave: string }[] = [];
  constructor(public ordenGuardada: OrdenCompra | null) {}

  orden = (_t: string, id: string) =>
    Promise.resolve(
      this.ordenGuardada && id === ORDEN ? this.ordenGuardada : null,
    );

  pagarCuotas(
    _t: string,
    p: {
      cantidad: number;
      referencia: string;
      clave: string;
      monto: Decimal;
    },
  ): Promise<CuotasPagadas> {
    this.cobros.push({
      cantidad: p.cantidad,
      monto: p.monto.toFixed(2),
      clave: p.clave,
    });
    const pago = this.ordenGuardada!.pagos[0]!;
    const aMarcar = pago.cuotas
      .filter((c) => c.estado === 'PENDIENTE')
      .sort((a, b) => a.numero - b.numero)
      .slice(0, p.cantidad);
    for (const c of aMarcar) {
      c.estado = 'CONFIRMADO';
      c.referencia = p.referencia;
      c.clave = p.clave;
    }
    return Promise.resolve({
      repetido: false,
      referencia: p.referencia,
      montoPagado: aMarcar.reduce((t, c) => t.plus(c.monto), D('0')),
      cuotasPagadas: aMarcar.map((c) => c.numero),
      cuotas: pago.cuotas,
    });
  }
}

function armar(orden: OrdenCompra | null) {
  const repo = new RepoFalso(orden);
  const compra = {
    orden: repo.orden,
    pagarCuotas: repo.pagarCuotas.bind(repo),
  } as unknown as CompraRepository;
  const pagos = new ProcesarPagoService(
    new PasarelaSimuladaAdapter(),
    new EstrategiaRegistry(),
  );
  return { repo, uso: new PagarCuotasUseCase(compra, pagos) };
}

const pagar = (
  uso: PagarCuotasUseCase,
  cantidad: number,
  idempotencyKey = 'clave-0001',
) => uso.ejecutar(TOKEN, { ordenId: ORDEN, cantidad, idempotencyKey });

describe('PagarCuotasUseCase', () => {
  it('paga la siguiente cuota pendiente', async () => {
    const { uso, repo } = armar(ordenCon({}));

    const r = await pagar(uso, 1);

    expect(repo.cobros).toEqual([
      { cantidad: 1, monto: '50.00', clave: 'clave-0001' },
    ]);
    expect(r.pago.montoPagado).toBe('50.00');
    expect(r.pago.cuotasPagadas).toEqual([2]);
    expect(r.pago.cuotasPendientes).toBe(3);
  });

  it('paga un grupo de cuotas, siempre las siguientes en orden', async () => {
    const { uso } = armar(ordenCon({}));

    const r = await pagar(uso, 3);

    expect(r.pago.montoPagado).toBe('150.00');
    expect(r.pago.cuotasPagadas).toEqual([2, 3, 4]);
    expect(r.pago.cuotasPendientes).toBe(1);
  });

  it('paga todas las que quedan de golpe', async () => {
    const { uso } = armar(ordenCon({}));

    const r = await pagar(uso, 4);

    expect(r.pago.montoPagado).toBe('200.00');
    expect(r.pago.cuotasPagadas).toEqual([2, 3, 4, 5]);
    expect(r.pago.cuotasPendientes).toBe(0);
    expect(r.pago.cuotas.every((c) => c.estado === 'CONFIRMADO')).toBe(true);
  });

  it('nunca salta el orden: tras pagar la 2, pagar "1 cuota" paga la 3', async () => {
    const { uso, repo } = armar(ordenCon({}));
    await pagar(uso, 1, 'clave-0001');
    const r = await pagar(uso, 1, 'clave-0002');

    expect(r.pago.cuotasPagadas).toEqual([3]);
    expect(repo.cobros.map((c) => c.cantidad)).toEqual([1, 1]);
  });

  it('suma el monto con decimales exactos (la última cuota absorbe el redondeo)', async () => {
    const cuotas = cronograma(4, '54.18');
    cuotas[3]!.monto = D('54.17');
    const { uso } = armar(ordenCon({ cuotas, numeroCuotas: 4 }));

    const r = await pagar(uso, 3);

    expect(r.pago.montoPagado).toBe('162.53');
  });

  it('repetir con la misma Idempotency-Key devuelve lo mismo SIN cobrar otra vez', async () => {
    const { uso, repo } = armar(ordenCon({}));
    const primera = await pagar(uso, 2, 'clave-igual');
    const segunda = await pagar(uso, 2, 'clave-igual');

    expect(repo.cobros).toHaveLength(1);
    expect(segunda.pago.cuotasPagadas).toEqual(primera.pago.cuotasPagadas);
    expect(segunda.pago.montoPagado).toBe('100.00');
    expect(segunda.pago.referencia).toBe(primera.pago.referencia);
    expect(segunda.pago.cuotasPendientes).toBe(2);
  });

  it('un reintento tras pagar la ÚLTIMA cuota tampoco cobra ni dice "al día"', async () => {
    const { uso, repo } = armar(ordenCon({}));
    await pagar(uso, 4, 'clave-ultima');

    const r = await pagar(uso, 4, 'clave-ultima');

    expect(repo.cobros).toHaveLength(1);
    expect(r.pago.cuotasPagadas).toEqual([2, 3, 4, 5]);
    expect(r.pago.cuotasPendientes).toBe(0);
  });

  it('con todas pagadas y otra clave → 409 "ya pagaste todas"', async () => {
    const { uso } = armar(ordenCon({}));
    await pagar(uso, 4, 'clave-ultima');
    await expect(pagar(uso, 1, 'clave-otra')).rejects.toThrow(
      new ConflictException(CUOTAS_AL_DIA),
    );
  });

  it('pedir más cuotas de las que quedan → 400 sin cobrar', async () => {
    const { uso, repo } = armar(ordenCon({}));
    await expect(pagar(uso, 5)).rejects.toThrow(
      new BadRequestException('Solo te quedan 4 cuotas por pagar'),
    );
    expect(repo.cobros).toHaveLength(0);
  });

  it('con una sola pendiente el mensaje va en singular', async () => {
    const cuotas = cronograma(2);
    const { uso } = armar(ordenCon({ cuotas, numeroCuotas: 2 }));
    await expect(pagar(uso, 2)).rejects.toThrow(
      new BadRequestException('Solo te queda 1 cuota por pagar'),
    );
  });

  it('un monto que la pasarela rechaza (termina en .13) → 400 y no marca nada', async () => {
    const cuotas = cronograma(3, '54.13');
    const { uso, repo } = armar(ordenCon({ cuotas, numeroCuotas: 3 }));

    await expect(pagar(uso, 1)).rejects.toThrow(
      new BadRequestException(PAGO_RECHAZADO),
    );
    expect(repo.cobros).toHaveLength(0);
    expect(cuotas.filter((c) => c.estado === 'PENDIENTE')).toHaveLength(2);
  });

  it('una cuota vencida se puede pagar igual (solo se avisa, sin recargo)', async () => {
    const cuotas = cronograma(3);
    cuotas[1]!.fechaVencimiento = '2020-01-01';
    const { uso } = armar(ordenCon({ cuotas, numeroCuotas: 3 }));

    const r = await pagar(uso, 1);

    expect(r.pago.montoPagado).toBe('50.00');
    expect(r.pago.cuotasPagadas).toEqual([2]);
  });

  it('compra pagada al contado → 409', async () => {
    const { uso } = armar(
      ordenCon({ modo: 'UNICO', numeroCuotas: null, cuotas: [] }),
    );
    await expect(pagar(uso, 1)).rejects.toThrow(
      new ConflictException(COMPRA_SIN_CUOTAS),
    );
  });

  it('compra sin pago confirmado → 409', async () => {
    const { uso } = armar(ordenCon(null));
    await expect(pagar(uso, 1)).rejects.toThrow(
      new ConflictException(COMPRA_SIN_PAGAR),
    );
  });

  it('compra inexistente o ajena (la RLS la oculta) → 404', async () => {
    const { uso } = armar(null);
    await expect(pagar(uso, 1)).rejects.toThrow(
      new NotFoundException(COMPRA_NO_EXISTE),
    );
  });
});

describe('vistaCuotasPagadas', () => {
  const base: CuotasPagadas = {
    repetido: false,
    referencia: 'SIM-1',
    montoPagado: D('50'),
    cuotasPagadas: [2],
    cuotas: [
      {
        numero: 1,
        monto: D('50'),
        fechaVencimiento: '2026-11-10',
        estado: 'CONFIRMADO',
      },
      {
        numero: 2,
        monto: D('50'),
        fechaVencimiento: '2026-11-20',
        estado: 'CONFIRMADO',
      },
      {
        numero: 3,
        monto: D('50'),
        fechaVencimiento: '2026-11-18',
        estado: 'PENDIENTE',
      },
      {
        numero: 4,
        monto: D('50'),
        fechaVencimiento: '2026-11-25',
        estado: 'PENDIENTE',
      },
    ],
  };

  it('da los días que faltan solo a las pendientes: negativo si ya venció', () => {
    const v = vistaCuotasPagadas(base, '2026-11-20');
    expect(v.pago.cuotas.map((c) => c.diasParaVencer)).toEqual([
      null,
      null,
      -2,
      5,
    ]);
    expect(v.pago.cuotas[0]!.monto).toBe('50.00');
  });

  it('una cuota que vence hoy tiene 0 días', () => {
    const v = vistaCuotasPagadas(base, '2026-11-18');
    expect(v.pago.cuotas[2]!.diasParaVencer).toBe(0);
  });

  it('el monto acumulado de cada pendiente es lo que cuesta pagar hasta ella', () => {
    const v = vistaCuotasPagadas(base, '2026-11-20');
    expect(v.pago.cuotas.map((c) => c.montoAcumulado)).toEqual([
      null,
      null,
      '50.00',
      '100.00',
    ]);
  });
});
