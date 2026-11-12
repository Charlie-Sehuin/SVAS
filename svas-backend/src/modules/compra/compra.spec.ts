import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { ErrorBaseDatos } from '../../common/filters/postgrest-error.filter';
import { AseguradoraSimuladaAdapter } from '../../integracion/emision/aseguradora-simulada.adapter';
import { EstrategiaRegistry } from '../../integracion/estrategias/estrategia.registry';
import { PasarelaSimuladaAdapter } from '../../integracion/pagos/pasarela-simulada.adapter';
import type { TarifaRepository } from '../cotizacion/domain/tarifa.repository.port';
import type { PlanTarifa } from '../cotizacion/domain/tarifa.types';
import { ProcesarPagoService } from '../pagos/application/procesar-pago.service';
import {
  ArmarCopiaContenidoService,
  CONTENIDO_PLAN_INCOMPLETO,
} from '../planes/application/armar-copia-contenido.service';
import type { ContenidoPlan } from '../planes/domain/contenido-plan';
import type { ContenidoPlanRepository } from '../planes/domain/contenido-plan.repository.port';
import type { EmitirPdfService } from '../polizas/application/emitir-pdf.service';
import type { ContenidoCongelado } from '../polizas/domain/poliza';
import {
  COMPRA_CON_OTRO_PLAN,
  COMPRA_NO_EXISTE,
  CompraService,
} from './application/compra.service';
import {
  COMPRA_YA_PAGADA,
  PAGO_RECHAZADO,
  PagarYEmitirUseCase,
} from './application/pagar-y-emitir.use-case';
import {
  camposFaltantes,
  type CotizacionCompra,
  type OrdenCompra,
  primaConDescuento,
  type PrimaCompra,
  recargoPorcentaje,
} from './domain/compra';
import type {
  CompraRepository,
  NuevaOrden,
  PagoParaRegistrar,
  VistaPreviaDescuento,
} from './domain/compra.repository.port';

const D = (v: string) => new Decimal(v);
const TOKEN = 'jwt-cliente';
const COT = '11111111-1111-4111-8111-111111111111';
const PRIMA = '22222222-2222-4222-8222-222222222222';
const ORDEN = '33333333-3333-4333-8333-333333333333';

const planLp: PlanTarifa = {
  planId: 'lp-full',
  nombre: 'Full',
  tasaBase: D('0.0400'),
  parametros: { recargo_pago_mensual: 0.05 },
};

const contenido: ContenidoPlan = {
  planId: 'lp-full',
  aseguradora: 'La Positiva',
  plan: 'Full',
  resumen: 'Cobertura completa',
  descripcion: null,
  idealPara: null,
  coberturas: [
    {
      codigo: 'ROBO_TOTAL',
      nombre: 'Robo total',
      categoria: 'ROBO',
      incluida: true,
      detalle: null,
      limiteMonto: null,
      orden: 1,
    },
  ],
  exclusiones: [],
  requisitos: [],
  actualizadoEn: null,
};

const primaLp = (prima = '651.79'): PrimaCompra => ({
  primaCotizadaId: PRIMA,
  planId: 'lp-full',
  plan: 'Full',
  aseguradoraId: 'aseg-lp',
  aseguradora: 'La Positiva',
  codigoEstrategia: 'LA_POSITIVA',
  sumaAsegurada: D('15000'),
  prima: D(prima),
  disponible: true,
});

/** Repositorio en memoria que imita las RPC lo justo para estos casos. */
class RepoFalso implements CompraRepository {
  cot: CotizacionCompra = {
    id: COT,
    estado: 'REGISTRADA',
    numeroDocumento: null,
    placa: 'ABC-123',
    orden: null,
  };
  primaCot: PrimaCompra | null = primaLp();
  descuento: VistaPreviaDescuento | null = {
    tipo: 'PRIMERA_COMPRA',
    porcentaje: D('5.00'),
    provisional: true,
  };
  ordenes = new Map<string, OrdenCompra>();
  creadas: NuevaOrden[] = [];
  rechazos: PagoParaRegistrar[] = [];
  confirmaciones = 0;
  /** Simula que otro intento confirmó justo antes (carrera). */
  confirmarCompite = false;

  cotizacion = (_t: string, id: string) =>
    Promise.resolve(id === COT ? this.cot : null);
  prima = (_t: string, _c: string, p: string) =>
    Promise.resolve(p === PRIMA ? this.primaCot : null);
  vistaPreviaDescuento = () => Promise.resolve(this.descuento);
  maxCuotas = () => Promise.resolve(12);
  completarDatos = (
    _t: string,
    _c: string,
    d: { numeroDocumento?: string; placa?: string },
  ) =>
    Promise.resolve({
      numeroDocumento: d.numeroDocumento ?? this.cot.numeroDocumento,
      placa: this.cot.placa ?? d.placa ?? null,
    });

  crearOrden(_t: string, o: NuevaOrden) {
    this.creadas.push(o);
    this.ponerOrden('651.79', '5.00');
    return Promise.resolve(ORDEN);
  }

  orden = (_t: string, id: string) =>
    Promise.resolve(this.ordenes.has(id) ? copia(this.ordenes.get(id)!) : null);

  registrarRechazo(_t: string, p: PagoParaRegistrar) {
    this.rechazos.push(p);
    this.agregarPago(p, 'RECHAZADO');
    return Promise.resolve();
  }

  confirmar(_t: string, p: PagoParaRegistrar & { numeroPoliza: string }) {
    this.confirmaciones++;
    this.agregarPago(p, 'CONFIRMADO');
    const o = this.ordenes.get(p.ordenId)!;
    o.poliza = { id: 'poliza-1', numero: p.numeroPoliza, pdfDisponible: false };
    if (this.confirmarCompite) {
      return Promise.reject(
        new ErrorBaseDatos({ code: 'PT409', message: COMPRA_YA_PAGADA }),
      );
    }
    return Promise.resolve({
      polizaId: 'poliza-1',
      numeroPoliza: p.numeroPoliza,
      pagoId: 'pago-x',
    });
  }

  ponerOrden(primaAnual: string, pct: string | null) {
    const descuento = pct
      ? { tipo: 'PRIMERA_COMPRA' as const, porcentaje: D(pct) }
      : null;
    this.ordenes.set(ORDEN, {
      id: ORDEN,
      cotizacionId: COT,
      primaCotizadaId: PRIMA,
      planId: 'lp-full',
      sumaAsegurada: D('15000'),
      primaAnual: D(primaAnual),
      descuento,
      primaFinal: primaConDescuento(
        D(primaAnual),
        descuento?.porcentaje ?? null,
      ),
      canalVenta: 'AUTONOMO',
      fecha: '2026-11-12T10:00:00Z',
      contenidoPlan: {
        ...contenido,
        congeladoEn: '2026-11-12T10:00:00Z',
      } as ContenidoCongelado,
      tarifa: { aseguradoraId: 'aseg-lp', codigoEstrategia: 'LA_POSITIVA' },
      pagos: [],
      poliza: null,
    });
    this.cot.orden = { id: ORDEN, primaCotizadaId: PRIMA };
  }

  private agregarPago(
    p: PagoParaRegistrar,
    estado: 'CONFIRMADO' | 'RECHAZADO',
  ) {
    const o = this.ordenes.get(p.ordenId)!;
    const cuotas =
      estado === 'CONFIRMADO' && p.numeroCuotas
        ? Array.from({ length: p.numeroCuotas }, (_, i) => ({
            numero: i + 1,
            monto: p.montoTotal.dividedBy(p.numeroCuotas!).toDecimalPlaces(2),
            fechaVencimiento: '2026-11-12',
            estado: i === 0 ? ('CONFIRMADO' as const) : ('PENDIENTE' as const),
          }))
        : [];
    o.pagos.push({
      id: `pago-${o.pagos.length + 1}`,
      modo: p.modo,
      monto: p.montoTotal,
      numeroCuotas: p.numeroCuotas,
      estado,
      referencia: p.referencia,
      fecha: `2026-11-12T10:0${o.pagos.length}:00Z`,
      cuotas,
    });
  }
}

/** Copia lo que el caso de uso podría tocar (structuredClone no admite Decimal). */
const copia = (o: OrdenCompra): OrdenCompra => ({
  ...o,
  pagos: o.pagos.map((p) => ({ ...p, cuotas: [...p.cuotas] })),
  poliza: o.poliza && { ...o.poliza },
});

const tarifas: TarifaRepository = {
  cargar: () =>
    Promise.resolve({ aseguradoraId: 'aseg-lp', planes: [planLp] } as never),
  invalidar: () => undefined,
};

function contenidoRepo(
  plan: ContenidoPlan | null = contenido,
  catalogo = [{ codigo: 'ROBO_TOTAL' }],
) {
  const invalidar = jest.fn();
  const repo: ContenidoPlanRepository = {
    publicado: () =>
      Promise.resolve({
        planes: new Map(plan ? [[plan.planId, plan]] : []),
        catalogo: catalogo as never,
      }),
    invalidar,
  };
  return { repo, invalidar };
}

function armar(repo = new RepoFalso(), pdfListo = true) {
  const registro = new EstrategiaRegistry();
  const intentar = jest.fn().mockResolvedValue(pdfListo);
  const pdf = { intentar } as unknown as EmitirPdfService;
  const servicio = new CompraService(
    repo,
    tarifas,
    registro,
    new ArmarCopiaContenidoService(contenidoRepo().repo),
  );
  const pagar = new PagarYEmitirUseCase(
    repo,
    tarifas,
    new AseguradoraSimuladaAdapter(),
    new ProcesarPagoService(new PasarelaSimuladaAdapter(), registro),
    pdf,
  );
  return { repo, servicio, pagar, intentar };
}

describe('compra · dominio', () => {
  it('campos faltantes: solo lo que no se capturó (RNF-08)', () => {
    expect(
      camposFaltantes({ numeroDocumento: null, placa: 'ABC-123' }).map(
        (c) => c.campo,
      ),
    ).toEqual(['numeroDocumento']);
    expect(
      camposFaltantes({ numeroDocumento: '12345678', placa: 'X' }),
    ).toEqual([]);
  });

  it('prima con descuento y recargo en %', () => {
    expect(primaConDescuento(D('651.79'), D('5')).toFixed(2)).toBe('619.20');
    expect(primaConDescuento(D('651.79'), null).toFixed(2)).toBe('651.79');
    expect(recargoPorcentaje(D('619.20'), D('650.16')).toFixed(2)).toBe('5.00');
    expect(recargoPorcentaje(D('665.00'), D('665.00')).toFixed(2)).toBe('0.00');
  });
});

describe('planes · ArmarCopiaContenidoService (RN-45)', () => {
  it('devuelve el contenido sin caché', async () => {
    const { repo, invalidar } = contenidoRepo();
    await expect(
      new ArmarCopiaContenidoService(repo).armar('lp-full'),
    ).resolves.toBe(contenido);
    expect(invalidar).toHaveBeenCalled();
  });

  it.each([
    ['sin plan', contenidoRepo(null).repo],
    ['sin resumen', contenidoRepo({ ...contenido, resumen: null }).repo],
    [
      'con una cobertura del catálogo sin definir (RN-42)',
      contenidoRepo(contenido, [{ codigo: 'ROBO_TOTAL' }, { codigo: 'RC' }])
        .repo,
    ],
  ])('409 CONTENIDO_PLAN_INCOMPLETO %s', async (_caso, repo) => {
    await expect(
      new ArmarCopiaContenidoService(repo).armar('lp-full'),
    ).rejects.toThrow(new ConflictException(CONTENIDO_PLAN_INCOMPLETO));
  });
});

describe('compra · CompraService', () => {
  it('resumen de La Positiva Full con primera compra (doc conexión §6)', async () => {
    const { servicio } = armar();
    const r = await servicio.resumen(TOKEN, COT, PRIMA);
    expect(r).toMatchObject({
      aseguradora: 'La Positiva',
      plan: 'Full',
      sumaAsegurada: '15000.00',
      primaAnual: '651.79',
      descuento: {
        tipo: 'PRIMERA_COMPRA',
        porcentaje: '5.00',
        provisional: true,
      },
      primaFinal: '619.20',
      ordenId: null,
      pago: {
        UNICO: { total: '619.20' },
        CUOTAS: {
          numeroCuotas: 12,
          total: '650.16',
          cuotaMensual: '54.18',
          recargoPorcentaje: '5.00',
        },
        maxCuotas: 12,
      },
    });
  });

  it('con orden, el resumen usa los montos congelados', async () => {
    const { servicio, repo } = armar();
    repo.ponerOrden('700.00', null);
    repo.descuento = null;
    const r = await servicio.resumen(TOKEN, COT, PRIMA);
    expect(r).toMatchObject({
      ordenId: ORDEN,
      primaAnual: '700.00',
      descuento: null,
      primaFinal: '700.00',
    });
  });

  it('con orden de otro plan → 409', async () => {
    const { servicio, repo } = armar();
    repo.ponerOrden('651.79', '5.00');
    repo.cot.orden = { id: ORDEN, primaCotizadaId: 'otra' };
    await expect(servicio.resumen(TOKEN, COT, PRIMA)).rejects.toThrow(
      new ConflictException(COMPRA_CON_OTRO_PLAN),
    );
  });

  it('cotización ajena o inexistente → 404; plan fuera de la cotización → 404', async () => {
    const { servicio } = armar();
    await expect(servicio.resumen(TOKEN, PRIMA, PRIMA)).rejects.toThrow(
      NotFoundException,
    );
    await expect(servicio.resumen(TOKEN, COT, COT)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('plan no disponible → 400', async () => {
    const { servicio, repo } = armar();
    repo.primaCot = { ...primaLp(), disponible: false };
    await expect(servicio.resumen(TOKEN, COT, PRIMA)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('guardar datos exige algo y enmascara el documento', async () => {
    const { servicio } = armar();
    await expect(servicio.guardarDatos(TOKEN, COT, {})).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      servicio.guardarDatos(TOKEN, COT, { numeroDocumento: '12345678' }),
    ).resolves.toEqual({
      numeroDocumento: '****5678',
      placa: 'ABC-123',
      camposFaltantes: [],
    });
  });

  it('crear: congela la copia del plan y devuelve la orden', async () => {
    const { servicio, repo } = armar();
    const r = await servicio.crear(TOKEN, {
      cotizacionId: COT,
      primaCotizadaId: PRIMA,
      aceptaCondiciones: true,
      firmaSimulada: 'Ana Pérez',
    });
    expect(repo.creadas[0]).toMatchObject({
      contenidoPlan: contenido,
      origen: null,
      firmaSimulada: 'Ana Pérez',
    });
    expect(r).toMatchObject({
      ordenId: ORDEN,
      estado: 'PENDIENTE_PAGO',
      primaFinal: '619.20',
      pago: null,
      poliza: null,
    });
  });

  it('estado de una compra inexistente → 404', async () => {
    const { servicio } = armar();
    await expect(servicio.estado(TOKEN, ORDEN)).rejects.toThrow(
      new NotFoundException(COMPRA_NO_EXISTE),
    );
  });
});

describe('compra · PagarYEmitirUseCase', () => {
  const pagarCuotas = {
    ordenId: ORDEN,
    modo: 'CUOTAS' as const,
    numeroCuotas: 12,
  };

  it('aprobado: confirma, emite y genera el PDF', async () => {
    const { pagar, repo, intentar } = armar();
    repo.ponerOrden('651.79', '5.00');
    const r = await pagar.ejecutar(TOKEN, {
      ...pagarCuotas,
      idempotencyKey: 'clave-0001',
    });
    expect(r.warning).toBeUndefined();
    expect(r.compra).toMatchObject({
      estado: 'CONFIRMADO',
      ordenId: ORDEN,
      polizaId: 'poliza-1',
      montoTotal: '650.16',
      modo: 'CUOTAS',
      numeroCuotas: 12,
    });
    expect(r.compra.numeroPoliza).toMatch(/^LPV-\d{4}-[0-9A-F]{8}$/);
    expect(r.compra.cuotas).toHaveLength(12);
    expect(intentar).toHaveBeenCalledWith('poliza-1');
  });

  it('si el PDF falla: 201 igual, con warning PDF_EN_GENERACION', async () => {
    const { pagar, repo } = armar(new RepoFalso(), false);
    repo.ponerOrden('651.79', '5.00');
    const r = await pagar.ejecutar(TOKEN, {
      ordenId: ORDEN,
      modo: 'UNICO',
      idempotencyKey: 'clave-0002',
    });
    expect(r.compra.montoTotal).toBe('619.20');
    expect(r.warning?.code).toBe('PDF_EN_GENERACION');
  });

  it('reintento con la misma clave: misma respuesta, un solo cobro', async () => {
    const { pagar, repo } = armar();
    repo.ponerOrden('651.79', '5.00');
    const s = { ...pagarCuotas, idempotencyKey: 'clave-0003' };
    const a = await pagar.ejecutar(TOKEN, s);
    const b = await pagar.ejecutar(TOKEN, s);
    expect(b.compra).toEqual(a.compra);
    expect(repo.confirmaciones).toBe(1);
  });

  it('ya pagada con otra clave → 409', async () => {
    const { pagar, repo } = armar();
    repo.ponerOrden('651.79', '5.00');
    await pagar.ejecutar(TOKEN, {
      ...pagarCuotas,
      idempotencyKey: 'clave-0004',
    });
    await expect(
      pagar.ejecutar(TOKEN, { ...pagarCuotas, idempotencyKey: 'clave-0005' }),
    ).rejects.toThrow(new ConflictException(COMPRA_YA_PAGADA));
  });

  it('rechazado (total .13): registra el intento y responde 400; el reintento repite el 400', async () => {
    const { pagar, repo } = armar();
    repo.ponerOrden('100.13', null);
    const s = {
      ordenId: ORDEN,
      modo: 'UNICO' as const,
      idempotencyKey: 'clave-0006',
    };
    await expect(pagar.ejecutar(TOKEN, s)).rejects.toThrow(
      new BadRequestException(PAGO_RECHAZADO),
    );
    await expect(pagar.ejecutar(TOKEN, s)).rejects.toThrow(
      new BadRequestException(PAGO_RECHAZADO),
    );
    expect(repo.rechazos).toHaveLength(1);
    expect(repo.confirmaciones).toBe(0);
  });

  it('carrera: si otro intento confirmó primero, responde lo mismo', async () => {
    const { pagar, repo } = armar();
    repo.ponerOrden('651.79', '5.00');
    repo.confirmarCompite = true;
    const r = await pagar.ejecutar(TOKEN, {
      ...pagarCuotas,
      idempotencyKey: 'clave-0007',
    });
    expect(r.compra.estado).toBe('CONFIRMADO');
  });

  it('cuotas fuera de rango → 400 sin cobrar', async () => {
    const { pagar, repo } = armar();
    repo.ponerOrden('651.79', '5.00');
    await expect(
      pagar.ejecutar(TOKEN, {
        ...pagarCuotas,
        numeroCuotas: 13,
        idempotencyKey: 'clave-0008',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repo.confirmaciones).toBe(0);
  });

  it('compra inexistente o ajena → 404', async () => {
    const { pagar } = armar();
    await expect(
      pagar.ejecutar(TOKEN, {
        ordenId: ORDEN,
        modo: 'UNICO',
        idempotencyKey: 'clave-0009',
      }),
    ).rejects.toThrow(new NotFoundException(COMPRA_NO_EXISTE));
  });
});
