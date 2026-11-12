import { Logger, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { sha256Hex } from '../../common/utils/token.util';
import type { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import type { Env } from '../../config/env.validation';
import { AsesoriasService } from './application/asesorias.service';
import {
  AvisoClienteService,
  WARNING_MENSAJE_NO_ENVIADO,
} from './application/aviso-cliente.service';
import { RetencionJobs } from './application/retencion.jobs';
import { RetomaService } from './application/retoma.service';
import { SeguimientosService } from './application/seguimientos.service';
import { contactoEnDetalle, contactoEnLista } from './application/vistas';
import type {
  AsesoriaRepository,
  CierreSeguimiento,
  ContactoDelCaso,
  Solicitud,
  SolicitudDetalle,
} from './domain/asesoria.repository.port';
import {
  FORMATO_TOKEN_RETOMA,
  mensajeEnlaceCompra,
  mensajeFinal,
  urlRetoma,
} from './domain/mensajes';
import type { NotificadorMensajes } from './domain/notificador-mensajes.port';
import {
  CierreSeguimientoDto,
  DescuentoDto,
  ResultadoSolicitudDto,
  SolicitarAsesoriaDto,
} from './presentation/dto/asesoria.dto';

// ── Fixtures ────────────────────────────────────────────────────────────────
const TOKEN = 'A'.repeat(43);
const ASESOR: UsuarioAutenticado = { id: 'a1', email: null, roles: ['ASESOR'] };
const ADMIN: UsuarioAutenticado = {
  id: 'ad',
  email: null,
  roles: ['ADMINISTRADOR'],
};

const contacto: ContactoDelCaso = {
  nombres: 'Ana María',
  apellidos: 'Ríos',
  telefono: '987654321',
  email: 'ana.rios@example.com',
  canalPreferido: 'WHATSAPP',
  numeroDocumento: '12345678',
};

const solicitud = (asesorId: string | null): SolicitudDetalle => ({
  id: 's1',
  motivo: 'DESCUENTO',
  estado: asesorId ? 'EN_ATENCION' : 'PENDIENTE',
  canal: 'WHATSAPP',
  origen: 'CLIENTE',
  fechaCreacion: '2026-11-11T10:00:00Z',
  asesorId,
  resultado: null,
  cotizacion: {
    id: 'c1',
    fecha: '2026-11-10T10:00:00Z',
    estado: 'REGISTRADA',
    vehiculo: 'Toyota Corolla 2022',
  },
  cliente: contacto,
  primas: [],
  descuentos: [],
});

const cierre = (enlaceToken: string | null): CierreSeguimiento => ({
  seguimientoId: 'g1',
  cotizacionId: 'c1',
  nombres: 'Ana María',
  canal: 'WHATSAPP',
  telefono: '987654321',
  enlaceToken,
  estado: enlaceToken ? 'DESCARTADO' : 'CONVERTIDO',
  motivo: enlaceToken ? 'NO_RESPONDE' : null,
});

function repoFalso(): jest.Mocked<AsesoriaRepository> {
  return {
    solicitar: jest.fn(),
    listarCola: jest.fn(),
    obtenerSolicitud: jest.fn(),
    tomar: jest.fn(),
    aplicarDescuento: jest.fn(),
    cerrarSolicitud: jest.fn(),
    listarSeguimientos: jest.fn(),
    obtenerSeguimiento: jest.fn(),
    registrarIntento: jest.fn(),
    enviarEnlaceCompra: jest.fn(),
    cerrarSeguimiento: jest.fn(),
    parametros: jest.fn().mockResolvedValue({
      descuentoMaximo: '10.00',
      maxIntentos: 4,
      diasSeguimiento: 7,
    }),
    detectarAbandonadas: jest.fn(),
    caducarSeguimientos: jest.fn(),
    resolverRetoma: jest.fn(),
  };
}

const config = {
  get: () => 'http://localhost:5173/',
} as unknown as ConfigService<Env, true>;

function notificadorFalso(
  impl: NotificadorMensajes['enviar'] = () =>
    Promise.resolve({ enviado: true }),
) {
  const enviar = jest.fn(impl);
  return { notificador: { enviar } as NotificadorMensajes, enviar };
}

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

// ── Dominio ─────────────────────────────────────────────────────────────────
describe('mensajes', () => {
  it('urlRetoma no duplica la barra final', () => {
    expect(urlRetoma('http://x.pe/', TOKEN)).toBe(
      `http://x.pe/retoma/${TOKEN}`,
    );
    expect(urlRetoma('http://x.pe', TOKEN)).toBe(`http://x.pe/retoma/${TOKEN}`);
  });

  it('saluda por el primer nombre e incluye el enlace', () => {
    const url = urlRetoma('http://x.pe', TOKEN);
    expect(mensajeEnlaceCompra('  Ana María ', url)).toMatch(
      /^Hola Ana, .*retoma\/A{43}/,
    );
    expect(mensajeFinal('Ana María', url)).toMatch(
      /^Hola Ana, .*descuento de primera compra/,
    );
  });

  it('formato del token de retoma: 43 caracteres base64url', () => {
    expect(FORMATO_TOKEN_RETOMA.test(TOKEN)).toBe(true);
    expect(FORMATO_TOKEN_RETOMA.test('a-b_c'.padEnd(43, 'x'))).toBe(true);
    expect(FORMATO_TOKEN_RETOMA.test('A'.repeat(42))).toBe(false);
    expect(FORMATO_TOKEN_RETOMA.test(`${'A'.repeat(42)}/`)).toBe(false);
  });
});

describe('vistas del contacto (doc conexión §5)', () => {
  it('en lista todo enmascarado', () => {
    expect(contactoEnLista(contacto)).toEqual({
      nombre: 'Ana María Ríos',
      telefono: '****4321',
      email: 'a******s@example.com',
      canalPreferido: 'WHATSAPP',
      numeroDocumento: '****5678',
    });
  });

  it('en detalle teléfono y email completos; documento según permiso', () => {
    expect(contactoEnDetalle(contacto, false)).toMatchObject({
      telefono: '987654321',
      email: 'ana.rios@example.com',
      numeroDocumento: '****5678',
    });
    expect(contactoEnDetalle(contacto, true).numeroDocumento).toBe('12345678');
    expect(
      contactoEnDetalle({ ...contacto, numeroDocumento: null }, false)
        .numeroDocumento,
    ).toBeNull();
  });
});

// ── AvisoClienteService ─────────────────────────────────────────────────────
describe('AvisoClienteService', () => {
  it('sin enlace no envía nada', async () => {
    const { notificador, enviar } = notificadorFalso();
    expect(
      await new AvisoClienteService(notificador, config).enviar(
        cierre(null),
        'MENSAJE_FINAL',
      ),
    ).toBeUndefined();
    expect(enviar).not.toHaveBeenCalled();
  });

  it('envía al teléfono por el canal preferido con el enlace de retoma', async () => {
    const { notificador, enviar } = notificadorFalso();
    const r = await new AvisoClienteService(notificador, config).enviar(
      cierre(TOKEN),
      'MENSAJE_FINAL',
    );
    expect(r).toBeUndefined();
    const arg = enviar.mock.calls[0]![0];
    expect(arg.canal).toBe('WHATSAPP');
    expect(arg.destinatario).toBe('987654321');
    expect(arg.texto).toContain(`http://localhost:5173/retoma/${TOKEN}`);
  });

  it.each([
    ['lanza', () => Promise.reject(new Error('caído'))],
    ['responde enviado=false', () => Promise.resolve({ enviado: false })],
  ])('si el notificador %s devuelve warning y no lanza', async (_c, impl) => {
    const { notificador } = notificadorFalso(
      impl as NotificadorMensajes['enviar'],
    );
    await expect(
      new AvisoClienteService(notificador, config).enviar(
        cierre(TOKEN),
        'ENLACE_COMPRA',
      ),
    ).resolves.toEqual(WARNING_MENSAJE_NO_ENVIADO);
  });
});

// ── AsesoriasService ────────────────────────────────────────────────────────
describe('AsesoriasService', () => {
  it('cola: enmascara y marca los casos del asesor', async () => {
    const repo = repoFalso();
    repo.listarCola.mockResolvedValue([
      solicitud('a1'),
      solicitud(null),
    ] as Solicitud[]);
    const r = await new AsesoriasService(repo).cola('jwt', 'a1', {
      origen: 'CLIENTE',
    });
    expect(repo.listarCola.mock.calls[0]).toEqual([
      'jwt',
      { origen: 'CLIENTE' },
    ]);
    expect(r.map((s) => s.asignadoAMi)).toEqual([true, false]);
    expect(r[0]!.cliente.telefono).toBe('****4321');
  });

  it('detalle: documento completo solo en el caso asignado o para el admin', async () => {
    const repo = repoFalso();
    const svc = new AsesoriasService(repo);

    repo.obtenerSolicitud.mockResolvedValue(solicitud('a1'));
    const propio = await svc.detalle('jwt', ASESOR, 's1');
    expect(propio.cliente.numeroDocumento).toBe('12345678');
    expect(propio.descuentoMaximo).toBe('10.00');

    repo.obtenerSolicitud.mockResolvedValue(solicitud('otro'));
    expect(
      (await svc.detalle('jwt', ASESOR, 's1')).cliente.numeroDocumento,
    ).toBe('****5678');
    expect(
      (await svc.detalle('jwt', ADMIN, 's1')).cliente.numeroDocumento,
    ).toBe('12345678');
  });

  it('detalle: 404 si RLS no la deja ver', async () => {
    const repo = repoFalso();
    repo.obtenerSolicitud.mockResolvedValue(null);
    await expect(
      new AsesoriasService(repo).detalle('jwt', ASESOR, 's1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── SeguimientosService ─────────────────────────────────────────────────────
describe('SeguimientosService', () => {
  const crear = (impl?: NotificadorMensajes['enviar']) => {
    const repo = repoFalso();
    const { notificador, enviar } = notificadorFalso(impl);
    const svc = new SeguimientosService(
      repo,
      new AvisoClienteService(notificador, config),
    );
    return { repo, enviar, svc };
  };

  it('intento sin cierre: no envía mensaje', async () => {
    const { repo, enviar, svc } = crear();
    repo.registrarIntento.mockResolvedValue({
      intentos: 1,
      maxIntentos: 4,
      cierre: null,
    });
    expect(
      await svc.registrarIntento('jwt', 'g1', 'WHATSAPP', 'NO_RESPONDE'),
    ).toEqual({
      intentos: 1,
      maxIntentos: 4,
      estado: 'EN_SEGUIMIENTO',
      motivoCierre: null,
    });
    expect(enviar).not.toHaveBeenCalled();
  });

  it('último intento cierra y envía el mensaje final; el token no sale en la respuesta', async () => {
    const { repo, enviar, svc } = crear();
    repo.registrarIntento.mockResolvedValue({
      intentos: 4,
      maxIntentos: 4,
      cierre: cierre(TOKEN),
    });
    const r = await svc.registrarIntento(
      'jwt',
      'g1',
      'WHATSAPP',
      'NO_RESPONDE',
    );
    expect(r).toMatchObject({
      estado: 'DESCARTADO',
      motivoCierre: 'NO_RESPONDE',
    });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('aceptación: si el mensaje falla responde con warning', async () => {
    const { repo, svc } = crear(() => Promise.reject(new Error('x')));
    repo.enviarEnlaceCompra.mockResolvedValue(cierre(TOKEN));
    expect(await svc.aceptacion('jwt', 'g1')).toEqual({
      enlaceEnviado: false,
      warning: WARNING_MENSAJE_NO_ENVIADO,
    });
  });

  it('cierre CONVERTIDO no envía mensaje', async () => {
    const { repo, enviar, svc } = crear();
    repo.cerrarSeguimiento.mockResolvedValue(cierre(null));
    expect(await svc.cerrar('jwt', 'g1', 'CONVERTIDO', null)).toEqual({
      estado: 'CONVERTIDO',
      motivoCierre: null,
    });
    expect(enviar).not.toHaveBeenCalled();
  });
});

// ── RetomaService ───────────────────────────────────────────────────────────
describe('RetomaService', () => {
  it('token mal formado: 404 sin tocar la base', async () => {
    const repo = repoFalso();
    await expect(
      new RetomaService(repo).resolver('corto'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.resolverRetoma.mock.calls).toHaveLength(0);
  });

  it('manda los hashes y devuelve un tokenAcceso nuevo que coincide con el hash guardado', async () => {
    const repo = repoFalso();
    repo.resolverRetoma.mockResolvedValue({
      cotizacionId: 'c1',
      descuento: { tipo: 'PRIMERA_COMPRA', porcentaje: '5.00' },
    });
    const r = await new RetomaService(repo).resolver(TOKEN);
    const [hashEnlace, hashNuevo] = repo.resolverRetoma.mock.calls[0]!;
    expect(hashEnlace).toBe(sha256Hex(TOKEN));
    expect(hashNuevo).toBe(sha256Hex(r.tokenAcceso));
    expect(r).toEqual({
      cotizacionId: 'c1',
      tokenAcceso: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as string,
      descuento: { tipo: 'PRIMERA_COMPRA', porcentaje: '5.00' },
    });
  });
});

// ── Jobs ────────────────────────────────────────────────────────────────────
describe('RetencionJobs', () => {
  it('el detector no lanza si el RPC falla', async () => {
    const repo = repoFalso();
    repo.detectarAbandonadas.mockRejectedValue(new Error('caída'));
    const { notificador } = notificadorFalso();
    await expect(
      new RetencionJobs(
        repo,
        new AvisoClienteService(notificador, config),
      ).detectarAbandono(),
    ).resolves.toBe(0);
  });

  it('la caducidad avisa a cada cerrado y cuenta los mensajes fallidos', async () => {
    const repo = repoFalso();
    repo.caducarSeguimientos.mockResolvedValue([
      cierre(TOKEN),
      cierre(TOKEN),
      cierre(TOKEN),
    ]);
    let n = 0;
    const { notificador, enviar } = notificadorFalso(() =>
      ++n === 2
        ? Promise.reject(new Error('x'))
        : Promise.resolve({ enviado: true }),
    );
    const r = await new RetencionJobs(
      repo,
      new AvisoClienteService(notificador, config),
    ).caducarSeguimientos();
    expect(r).toEqual({ cerrados: 3, sinMensaje: 1 });
    expect(enviar).toHaveBeenCalledTimes(3);
  });
});

// ── DTOs ────────────────────────────────────────────────────────────────────
describe('DTOs de asesoría y retención', () => {
  const errores = async <T extends object>(cls: new () => T, plano: object) =>
    (await validate(plainToInstance(cls, plano))).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );

  it('el cliente no puede pedir con motivos del sistema', async () => {
    const base = {
      cotizacionId: '00000000-0000-4000-8000-000000000001',
      canal: 'WHATSAPP',
    };
    expect(
      await errores(SolicitarAsesoriaDto, { ...base, motivo: 'DUDA' }),
    ).toEqual([]);
    expect(
      await errores(SolicitarAsesoriaDto, { ...base, motivo: 'INSPECCION' }),
    ).toEqual(['Elige el motivo: duda, negociación o descuento']);
  });

  it('porcentaje acepta número o string con hasta 2 decimales', async () => {
    const planId = '00000000-0000-4000-8000-000000000001';
    expect(await errores(DescuentoDto, { planId, porcentaje: 8.5 })).toEqual(
      [],
    );
    expect(
      await errores(DescuentoDto, { planId, porcentaje: '8.555' }),
    ).toHaveLength(1);
  });

  it('resultado se recorta y no puede quedar vacío', async () => {
    expect(
      await errores(ResultadoSolicitudDto, { resultado: '   ', acepta: true }),
    ).toEqual(['Describe el resultado de la atención']);
    expect(
      await errores(ResultadoSolicitudDto, { resultado: 'ok', acepta: 'si' }),
    ).toEqual(['Indica si el cliente aceptó']);
  });

  it('DESCARTADO exige motivo; CONVERTIDO no', async () => {
    expect(
      await errores(CierreSeguimientoDto, { estado: 'DESCARTADO' }),
    ).toEqual(['Elige el motivo del cierre']);
    expect(
      await errores(CierreSeguimientoDto, {
        estado: 'DESCARTADO',
        motivo: 'PRECIO',
      }),
    ).toEqual([]);
    expect(
      await errores(CierreSeguimientoDto, { estado: 'CONVERTIDO' }),
    ).toEqual([]);
    expect(
      await errores(CierreSeguimientoDto, { estado: 'EN_SEGUIMIENTO' }),
    ).toHaveLength(1);
  });
});
