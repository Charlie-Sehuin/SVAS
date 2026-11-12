import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  type ExecutionContext,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { sha256Hex } from '../../../common/utils/token.util';
import type { CatalogoPublicoRepository } from '../domain/catalogo-publico.port';
import type {
  CotizacionGuardada,
  CotizacionRepository,
} from '../domain/cotizacion.repository.port';
import { CotizacionAccesoGuard } from '../presentation/cotizacion-acceso.guard';
import type {
  CalculadoraPrimasService,
  PrimasAseguradora,
} from './calculadora-primas.service';
import {
  AjustarSumaUseCase,
  CotizarUseCase,
  formatearUsd,
  ObtenerResumenUseCase,
  type DatosCotizar,
} from './cotizaciones.use-cases';

const ID = '11111111-1111-4111-8111-111111111111';
const D = (v: string) => new Decimal(v);

const VEHICULO = {
  marcaId: 'toyota',
  modeloId: 'corolla',
  tipoId: 'sedan',
  anio: 2022,
  ubigeo: '150122',
  marca: 'Toyota',
  modelo: 'Corolla',
  tipo: 'Sedán',
};

function primasRimac(disponible = true, suma = '14400.00'): PrimasAseguradora {
  return {
    aseguradoraId: 'rimac',
    aseguradora: 'Rímac',
    codigoEstrategia: 'RIMAC',
    rangoSuma: { minima: D('12000'), maxima: D('16800') },
    planes: ['Plata', 'Oro'].map((plan, i) =>
      disponible
        ? {
            planId: `p${i}`,
            plan,
            disponible: true,
            sumaAsegurada: D(suma),
            prima: D(i ? '614.78' : '439.13'),
            primaMensual: D(i ? '51.23' : '36.59'),
            detalleCalculo: { estrategia: 'RIMAC' },
          }
        : {
            planId: `p${i}`,
            plan,
            disponible: false,
            motivoNoDisponible: 'SIN_RANGO' as const,
          },
    ),
  };
}

function dobles() {
  const catalogo = {
    camposActivos: jest.fn().mockResolvedValue([
      {
        aseguradora: 'Rímac',
        nombre: 'marca',
        tipo: 'LISTA',
        obligatorio: true,
        origenValores: 'CATALOGO',
        valores: [],
      },
    ]),
    reglasInspeccion: jest
      .fn()
      .mockResolvedValue([
        {
          aseguradoraId: 'rimac',
          uso: 'TRANSPORTE_PASAJEROS',
          requiereInspeccion: true,
        },
      ]),
    resolverVehiculo: jest.fn().mockResolvedValue(VEHICULO),
  } as unknown as jest.Mocked<CatalogoPublicoRepository>;

  const repo = {
    registrar: jest.fn().mockResolvedValue({
      cotizacionId: ID,
      fecha: '2026-11-11T10:00:00Z',
      primas: [
        { id: 'pc0', planId: 'p0' },
        { id: 'pc1', planId: 'p1' },
      ],
    }),
    obtener: jest.fn(),
    obtenerAcceso: jest.fn(),
    esVisiblePara: jest.fn(),
    actualizarSuma: jest.fn().mockResolvedValue({ simulacionesInvalidadas: 0 }),
    vincularCliente: jest.fn(),
    listarMias: jest.fn(),
    contarAsegurados: jest
      .fn()
      .mockResolvedValue({ particular: 0, comercial: 0 }),
  } satisfies jest.Mocked<CotizacionRepository>;

  const calculadora = {
    calcular: jest.fn().mockResolvedValue([primasRimac()]),
  } as unknown as jest.Mocked<CalculadoraPrimasService>;

  return { catalogo, repo, calculadora };
}

const DATOS: DatosCotizar = {
  vehiculo: {
    uso: 'PARTICULAR',
    marcaId: 'toyota',
    modeloId: 'corolla',
    anio: 2022,
  },
  ubicacion: { ubigeo: '150122' },
  contacto: {
    nombres: 'Ana',
    apellidos: 'Ríos',
    telefono: '987654321',
    email: 'ana@example.com',
    canalPreferido: 'WHATSAPP',
  },
};

describe('CotizarUseCase', () => {
  it('cotiza con el punto medio, registra por RPC y devuelve el token una vez', async () => {
    const { catalogo, repo, calculadora } = dobles();
    const r = await new CotizarUseCase(catalogo, repo, calculadora).ejecutar(
      DATOS,
    );

    expect(calculadora.calcular.mock.calls[0]).toEqual([VEHICULO]); // sin suma
    const enviado = repo.registrar.mock.calls[0][0];
    expect(enviado.tokenHash).toBe(sha256Hex(r.tokenAcceso));
    expect(enviado.opciones).toEqual(['COMPRA_INMEDIATA', 'ASESORIA']);
    expect(enviado.motivoDerivacion).toBeNull();

    expect(r.cotizacion.id).toBe(ID);
    expect(
      r.cotizacion.primas.map((p) => [p.id, p.plan, p.prima, p.primaMensual]),
    ).toEqual([
      ['pc0', 'Plata', '439.13', '36.59'],
      ['pc1', 'Oro', '614.78', '51.23'],
    ]);
    expect(r.cotizacion.primas[0].rangoSuma).toEqual({
      minima: '12000.00',
      maxima: '16800.00',
    });
    expect(r.cotizacion.primas[0]).not.toHaveProperty('detalleCalculo');
    expect(r.warning).toBeUndefined();
  });

  it('RN-04: si nadie cotiza deriva NO_ASEGURABLE y avisa', async () => {
    const { catalogo, repo, calculadora } = dobles();
    calculadora.calcular.mockResolvedValue([primasRimac(false)]);
    const r = await new CotizarUseCase(catalogo, repo, calculadora).ejecutar(
      DATOS,
    );
    expect(repo.registrar.mock.calls[0][0]).toMatchObject({
      opciones: ['ASESORIA'],
      motivoDerivacion: 'NO_ASEGURABLE',
    });
    expect(r.warning).toEqual({
      code: 'ASEGURADORA_SIN_COTIZACION',
      message: 'Rímac no pudo cotizar este vehículo; te mostramos las demás.',
    });
  });

  it('RN-03: transporte de pasajeros va a INSPECCION', async () => {
    const { catalogo, repo, calculadora } = dobles();
    await new CotizarUseCase(catalogo, repo, calculadora).ejecutar({
      ...DATOS,
      vehiculo: { ...DATOS.vehiculo, uso: 'TRANSPORTE_PASAJEROS' },
    });
    expect(repo.registrar.mock.calls[0][0].motivoDerivacion).toBe('INSPECCION');
  });

  it('RN-05: fuera de nicho → 422 y no registra nada', async () => {
    const { catalogo, repo, calculadora } = dobles();
    repo.contarAsegurados.mockResolvedValue({ particular: 2, comercial: 0 });
    await expect(
      new CotizarUseCase(catalogo, repo, calculadora).ejecutar(DATOS),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(repo.registrar).not.toHaveBeenCalled();
  });

  it('RF-03: modelo de otra marca → 400', async () => {
    const { catalogo, repo, calculadora } = dobles();
    catalogo.resolverVehiculo.mockResolvedValue({
      ...VEHICULO,
      marcaId: 'kia',
    });
    await expect(
      new CotizarUseCase(catalogo, repo, calculadora).ejecutar(DATOS),
    ).rejects.toThrow(BadRequestException);
    expect(repo.registrar).not.toHaveBeenCalled();
  });

  it('RF-03: modelo o distrito inexistente → 400', async () => {
    const { catalogo, repo, calculadora } = dobles();
    catalogo.resolverVehiculo.mockResolvedValue(null);
    await expect(
      new CotizarUseCase(catalogo, repo, calculadora).ejecutar(DATOS),
    ).rejects.toThrow(BadRequestException);
  });
});

function guardada(
  cambios: Partial<CotizacionGuardada> = {},
): CotizacionGuardada {
  return {
    id: ID,
    fecha: '2026-11-11T10:00:00Z',
    estado: 'REGISTRADA',
    motivoDerivacion: null,
    opciones: ['COMPRA_INMEDIATA', 'ASESORIA'],
    tokenHash: sha256Hex('tok'),
    vehiculo: {
      ...VEHICULO,
      uso: 'PARTICULAR',
      distrito: 'Miraflores',
      placa: null,
      clase: null,
    },
    primas: [0, 1].map((i) => ({
      id: `pc${i}`,
      planId: `p${i}`,
      plan: i ? 'Oro' : 'Plata',
      aseguradoraId: 'rimac',
      aseguradora: 'Rímac',
      disponible: true,
      motivoNoDisponible: null,
      sumaAsegurada: D('14400'),
      prima: D(i ? '614.78' : '439.13'),
      primaMensual: D(i ? '51.23' : '36.59'),
      detalleCalculo: { estrategia: 'RIMAC' },
    })),
    ...cambios,
  };
}

describe('ObtenerResumenUseCase', () => {
  const tarifas = {
    cargar: jest.fn().mockResolvedValue({
      rangos: new Map([
        ['corolla:2022', { minima: D('12000'), maxima: D('16800') }],
      ]),
    }),
    invalidar: jest.fn(),
  };

  it('el desglose solo sale si se pide (ASESOR/ADMIN)', async () => {
    const { repo } = dobles();
    repo.obtener.mockResolvedValue(guardada());
    const uc = new ObtenerResumenUseCase(repo, tarifas);
    const cliente = await uc.ejecutar(ID, false);
    const admin = await uc.ejecutar(ID, true);
    expect(cliente.cotizacion.primas[0]).not.toHaveProperty('detalleCalculo');
    expect(admin.cotizacion.primas[0].detalleCalculo).toEqual({
      estrategia: 'RIMAC',
    });
    expect(cliente.cotizacion.primas[0].rangoSuma).toEqual({
      minima: '12000.00',
      maxima: '16800.00',
    });
    expect(cliente.cotizacion.vehiculo.distrito).toBe('Miraflores');
  });

  it('404 si no existe', async () => {
    const { repo } = dobles();
    repo.obtener.mockResolvedValue(null);
    await expect(
      new ObtenerResumenUseCase(repo, tarifas).ejecutar(ID, false),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('AjustarSumaUseCase (RN-37)', () => {
  const entrada = {
    cotizacionId: ID,
    aseguradoraId: 'rimac',
    sumaAsegurada: '15000.00',
    verDesglose: false,
  };

  it('recalcula solo esa aseguradora y persiste por RPC', async () => {
    const { repo, calculadora } = dobles();
    repo.obtener.mockResolvedValue(guardada());
    calculadora.calcular.mockResolvedValue([primasRimac(true, '15000.00')]);
    const r = await new AjustarSumaUseCase(repo, calculadora).ejecutar({
      ...entrada,
      accessToken: 'jwt',
    });
    expect(calculadora.calcular.mock.calls[0][1]).toEqual({
      suma: D('15000.00'),
      aseguradoraIds: ['rimac'],
    });
    expect(repo.actualizarSuma).toHaveBeenCalledWith(
      ID,
      'rimac',
      expect.any(Array),
      'jwt',
    );
    expect(r.primas.map((p) => [p.id, p.sumaAsegurada])).toEqual([
      ['pc0', '15000.00'],
      ['pc1', '15000.00'],
    ]);
    expect(r.warning).toBeUndefined();
  });

  it('avisa SIMULACION_DESACTUALIZADA si había simulación vigente', async () => {
    const { repo, calculadora } = dobles();
    repo.obtener.mockResolvedValue(guardada());
    repo.actualizarSuma.mockResolvedValue({ simulacionesInvalidadas: 1 });
    const r = await new AjustarSumaUseCase(repo, calculadora).ejecutar(entrada);
    expect(r.warning?.code).toBe('SIMULACION_DESACTUALIZADA');
  });

  it('409 si la cotización ya es CONVERTIDA', async () => {
    const { repo, calculadora } = dobles();
    repo.obtener.mockResolvedValue(guardada({ estado: 'CONVERTIDA' }));
    await expect(
      new AjustarSumaUseCase(repo, calculadora).ejecutar(entrada),
    ).rejects.toThrow(ConflictException);
  });

  it('400 con el rango en el mensaje si la suma está fuera', async () => {
    const { repo, calculadora } = dobles();
    repo.obtener.mockResolvedValue(guardada());
    calculadora.calcular.mockResolvedValue([
      { ...primasRimac(false), errorSuma: 'fuera' },
    ]);
    const error = (await new AjustarSumaUseCase(repo, calculadora)
      .ejecutar({ ...entrada, sumaAsegurada: '99999' })
      .catch((e: unknown) => e)) as BadRequestException;
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({
      message:
        'La suma asegurada de Rímac debe estar entre USD 12,000.00 y USD 16,800.00',
      errors: [
        {
          campo: 'sumaAsegurada',
          mensaje: 'Fuera del rango permitido (12000.00 – 16800.00)',
        },
      ],
    });
    expect(repo.actualizarSuma).not.toHaveBeenCalled();
  });

  it('404 si la cotización no tiene planes de esa aseguradora', async () => {
    const { repo, calculadora } = dobles();
    repo.obtener.mockResolvedValue(guardada());
    await expect(
      new AjustarSumaUseCase(repo, calculadora).ejecutar({
        ...entrada,
        aseguradoraId: 'otra',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('formatearUsd', () => {
  it('separa miles con coma', () => {
    expect(formatearUsd(D('12000'))).toBe('USD 12,000.00');
    expect(formatearUsd(D('950.5'))).toBe('USD 950.50');
    expect(formatearUsd(D('1234567.891'))).toBe('USD 1,234,567.89');
  });
});

describe('CotizacionAccesoGuard (backend §4.4)', () => {
  function contexto(req: Record<string, unknown>) {
    const r = { params: { id: ID }, headers: {}, ...req };
    return {
      req: r,
      ctx: {
        switchToHttp: () => ({ getRequest: () => r }),
      } as unknown as ExecutionContext,
    };
  }

  it('con JWT que la RLS deja ver → JWT', async () => {
    const { repo } = dobles();
    repo.esVisiblePara.mockResolvedValue(true);
    const { req, ctx } = contexto({ usuario: { id: 'u' }, accessToken: 'jwt' });
    await expect(
      new CotizacionAccesoGuard(repo).canActivate(ctx),
    ).resolves.toBe(true);
    expect(req).toMatchObject({ accesoCotizacion: 'JWT' });
  });

  it('con el token correcto → TOKEN', async () => {
    const { repo } = dobles();
    repo.obtenerAcceso.mockResolvedValue({
      tokenHash: sha256Hex('tok'),
      estado: 'REGISTRADA',
    });
    const { req, ctx } = contexto({ headers: { 'x-cotizacion-token': 'tok' } });
    await expect(
      new CotizacionAccesoGuard(repo).canActivate(ctx),
    ).resolves.toBe(true);
    expect(req).toMatchObject({ accesoCotizacion: 'TOKEN' });
  });

  it('token equivocado → 403', async () => {
    const { repo } = dobles();
    repo.obtenerAcceso.mockResolvedValue({
      tokenHash: sha256Hex('tok'),
      estado: 'REGISTRADA',
    });
    const { ctx } = contexto({ headers: { 'x-cotizacion-token': 'otro' } });
    await expect(
      new CotizacionAccesoGuard(repo).canActivate(ctx),
    ).rejects.toThrow(ForbiddenException);
  });

  it('el token deja de servir cuando la cotización es CONVERTIDA', async () => {
    const { repo } = dobles();
    repo.obtenerAcceso.mockResolvedValue({
      tokenHash: sha256Hex('tok'),
      estado: 'CONVERTIDA',
    });
    const { ctx } = contexto({ headers: { 'x-cotizacion-token': 'tok' } });
    await expect(
      new CotizacionAccesoGuard(repo).canActivate(ctx),
    ).rejects.toThrow(ForbiddenException);
  });

  it('sin JWT ni token → 401', async () => {
    const { repo } = dobles();
    const { ctx } = contexto({});
    await expect(
      new CotizacionAccesoGuard(repo).canActivate(ctx),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('id que no es uuid → 400', async () => {
    const { repo } = dobles();
    const { ctx } = contexto({ params: { id: 'abc' } });
    await expect(
      new CotizacionAccesoGuard(repo).canActivate(ctx),
    ).rejects.toThrow(BadRequestException);
  });
});
