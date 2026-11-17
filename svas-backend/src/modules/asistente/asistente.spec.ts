import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  configRazonamiento,
  esErrorPasajero,
  RespuestaInvalidaError,
} from '../../integracion/asistente/asistente-gemini.adapter';
import { AsistenteSimuladoAdapter } from '../../integracion/asistente/asistente-simulado.adapter';
import { conReintento } from '../../integracion/asistente/reintento';
import type { ObtenerResumenUseCase } from '../cotizacion/application/cotizaciones.use-cases';
import type { ContenidoPlanRepository } from '../planes/domain/contenido-plan.repository.port';
import { ConversarUseCase } from './application/conversar.use-case';
import {
  armarContexto,
  armarInstrucciones,
  LEYENDA_ASISTENTE,
  mencionaMontoDesconocido,
  montosMencionados,
  validarRespuesta,
  type ContenidoParaAsistente,
  type CotizacionParaAsistente,
} from './domain/asistente';
import type {
  AsistenteConversacional,
  RespuestaCruda,
} from './domain/asistente-conversacional.port';

const plan = (
  planId: string,
  aseguradora: string,
  nombre: string,
  extra: Partial<ContenidoParaAsistente> = {},
): ContenidoParaAsistente => ({
  planId,
  aseguradora,
  plan: nombre,
  resumen: `Resumen de ${nombre}`,
  descripcion: null,
  idealPara: null,
  coberturas: [
    {
      nombre: 'Responsabilidad civil',
      incluida: true,
      detalle: null,
      limiteMonto: '100000.00',
    },
    {
      nombre: 'Auto de reemplazo',
      incluida: false,
      detalle: null,
      limiteMonto: null,
    },
  ],
  exclusiones: ['Conducir sin licencia'],
  requisitos: [{ texto: 'Vehículo del 2006 al 2027', obligatorio: true }],
  ...extra,
});

const CONTENIDOS = [
  plan('id-plata', 'Rímac', 'Plata'),
  plan('id-oro', 'Rímac', 'Oro'),
  plan('id-sin', 'Mapfre', 'Borrador', { resumen: null }),
];

const COTIZACION: CotizacionParaAsistente = {
  motivoDerivacion: null,
  vehiculo: {
    uso: 'PARTICULAR',
    marca: 'Toyota',
    modelo: 'Corolla',
    anio: 2022,
    distrito: 'Miraflores',
  },
  primas: [
    {
      id: 'prima-1',
      planId: 'id-plata',
      aseguradora: 'Rímac',
      plan: 'Plata',
      resumen: 'Resumen de Plata',
      disponible: true,
      sumaAsegurada: '14400.00',
      prima: '439.13',
      primaMensual: '36.59',
    },
    {
      id: 'prima-2',
      planId: 'id-oro',
      aseguradora: 'Rímac',
      plan: 'Oro',
      resumen: 'Resumen de Oro',
      disponible: false,
      sumaAsegurada: null,
      prima: null,
      primaMensual: null,
    },
  ],
};

const cruda = (parcial: Partial<RespuestaCruda> = {}): RespuestaCruda => ({
  respuesta: 'Hola, ¿para qué usas tu auto?',
  planes: [],
  acciones: [],
  ...parcial,
});

describe('asistente · contexto e instrucciones', () => {
  it('sin cotización: solo planes con contenido publicado, sin precios', () => {
    const ctx = armarContexto(CONTENIDOS);
    expect(ctx.planes.map((p) => [p.clave, p.plan])).toEqual([
      ['P1', 'Plata'],
      ['P2', 'Oro'],
    ]);
    expect(ctx.planes.every((p) => p.precio === null)).toBe(true);
    const texto = armarInstrucciones(ctx);
    expect(texto).toContain('todavía NO tiene una cotización');
    expect(texto).toContain('[P1] Rímac · Plata');
    expect(texto).toContain('No cubre: Auto de reemplazo');
    expect(texto).toContain('COTIZAR');
    expect(texto).not.toContain('PRUEBA_CHOQUE');
    expect(texto).not.toContain('Precio:');
  });

  it('sin cotización: menciona el auto reconocido por foto', () => {
    const ctx = armarContexto(CONTENIDOS, null, {
      marca: 'Toyota',
      modelo: 'Hilux',
    });
    expect(armarInstrucciones(ctx)).toContain('Su auto es un Toyota Hilux.');
  });

  it('con cotización: solo los planes que cotizaron, con su precio tal cual', () => {
    const ctx = armarContexto(CONTENIDOS, COTIZACION);
    expect(ctx.planes).toHaveLength(1);
    expect(ctx.planes[0]!.precio).toEqual({
      primaCotizadaId: 'prima-1',
      sumaAsegurada: '14400.00',
      primaAnual: '439.13',
      primaMensual: '36.59',
    });
    const texto = armarInstrucciones(ctx);
    expect(texto).toContain('Toyota Corolla 2022');
    expect(texto).toContain('prima anual USD 439.13');
    expect(texto).toContain('PRUEBA_CHOQUE');
    expect(texto).not.toContain('- COTIZAR');
  });

  it('cotización derivada a un asesor: no invita a comprar en línea', () => {
    const ctx = armarContexto(CONTENIDOS, {
      ...COTIZACION,
      motivoDerivacion: 'USO_COMERCIAL',
    });
    expect(armarInstrucciones(ctx)).toContain('no invites a comprar en línea');
  });
});

describe('asistente · guardia de precios', () => {
  it('reconoce montos en varios formatos', () => {
    expect(montosMencionados('Cuesta USD 439.13 al año')).toEqual([439.13]);
    expect(montosMencionados('unos $ 16,800 o S/ 1.234,50')).toEqual([
      16800, 1234.5,
    ]);
    expect(montosMencionados('son 300 dólares.')).toEqual([300]);
    expect(montosMencionados('del 2006 al 2027, hasta 3 planes')).toEqual([]);
  });

  it('acepta un monto entregado aunque cambie el formato y rechaza el inventado', () => {
    const datos = 'prima anual USD 439.13, límite USD 100000.00';
    expect(mencionaMontoDesconocido('Pagas USD 439.13', datos)).toBe(false);
    expect(mencionaMontoDesconocido('Cubre hasta USD 100,000', datos)).toBe(
      false,
    );
    expect(mencionaMontoDesconocido('Te sale USD 350', datos)).toBe(true);
  });
});

describe('asistente · validar la respuesta del proveedor', () => {
  const ctxSin = armarContexto(CONTENIDOS);
  const ctxCon = armarContexto(CONTENIDOS, COTIZACION);

  it('solo deja planes que existen, sin repetir y como máximo 2', () => {
    const r = validarRespuesta(
      cruda({
        planes: [
          { clave: 'P9', motivo: 'no existe' },
          { clave: 'p1', motivo: ' Buen equilibrio ' },
          { clave: 'P1', motivo: 'repetido' },
          { clave: 'P2', motivo: 'Más completo' },
        ],
      }),
      ctxSin,
    );
    expect(r.planesRecomendados).toEqual([
      {
        planId: 'id-plata',
        aseguradora: 'Rímac',
        plan: 'Plata',
        resumen: 'Resumen de Plata',
        motivo: 'Buen equilibrio',
      },
      {
        planId: 'id-oro',
        aseguradora: 'Rímac',
        plan: 'Oro',
        resumen: 'Resumen de Oro',
        motivo: 'Más completo',
      },
    ]);
    expect(r.leyenda).toBe(LEYENDA_ASISTENTE);
  });

  it('con cotización: el precio de la tarjeta sale del backend, no del proveedor', () => {
    const r = validarRespuesta(
      cruda({
        respuesta: 'Te conviene Plata: USD 439.13 al año.',
        planes: [{ clave: 'P1', motivo: 'El más barato' }],
      }),
      ctxCon,
    );
    expect(r.respuesta).toBe('Te conviene Plata: USD 439.13 al año.');
    expect(r.planesRecomendados[0]).toMatchObject({
      primaCotizadaId: 'prima-1',
      primaAnual: '439.13',
      primaMensual: '36.59',
      sumaAsegurada: '14400.00',
    });
  });

  it('un monto inventado tumba el texto y ofrece un asesor', () => {
    const r = validarRespuesta(
      cruda({ respuesta: 'Un seguro así cuesta unos USD 500 al año.' }),
      ctxSin,
    );
    expect(r.respuesta).toContain('no darte un monto que no tengo confirmado');
    expect(r.acciones).toEqual(['HABLAR_ASESOR']);
  });

  it('un motivo con monto inventado se vacía', () => {
    const r = validarRespuesta(
      cruda({ planes: [{ clave: 'P1', motivo: 'Solo USD 99 al mes' }] }),
      ctxCon,
    );
    expect(r.planesRecomendados[0]!.motivo).toBe('');
  });

  it('filtra las acciones según la situación', () => {
    const todas = [
      'COTIZAR',
      'ENVIAR_FOTO',
      'PRUEBA_CHOQUE',
      'HABLAR_ASESOR',
      'BORRAR_TODO',
    ];
    expect(
      validarRespuesta(cruda({ acciones: todas }), ctxSin).acciones,
    ).toEqual(['COTIZAR', 'ENVIAR_FOTO', 'HABLAR_ASESOR']);
    expect(
      validarRespuesta(cruda({ acciones: todas }), ctxCon).acciones,
    ).toEqual(['PRUEBA_CHOQUE', 'HABLAR_ASESOR']);
  });

  it('una respuesta vacía se reemplaza por un texto de cortesía', () => {
    expect(
      validarRespuesta(cruda({ respuesta: '  ' }), ctxSin).respuesta,
    ).toContain('No pude armar una respuesta');
  });
});

describe('ConversarUseCase', () => {
  function crear(respuesta: RespuestaCruda = cruda()) {
    const responder = jest.fn().mockResolvedValue(respuesta);
    const publicado = jest.fn().mockResolvedValue({
      planes: new Map(CONTENIDOS.map((c) => [c.planId, c])),
      catalogo: [],
    });
    const resumen = jest.fn().mockResolvedValue({ cotizacion: COTIZACION });
    const useCase = new ConversarUseCase(
      { responder } as AsistenteConversacional,
      { publicado } as unknown as ContenidoPlanRepository,
      { ejecutar: resumen } as unknown as ObtenerResumenUseCase,
    );
    return { useCase, responder, resumen };
  }
  const HOLA = [{ rol: 'usuario' as const, texto: 'Hola' }];

  it('sin cotización: no lee ninguna cotización y pasa las claves de los planes', async () => {
    const { useCase, responder, resumen } = crear();
    const r = await useCase.ejecutar({ mensajes: HOLA });
    expect(resumen).not.toHaveBeenCalled();
    expect(responder).toHaveBeenCalledWith(
      expect.objectContaining({ mensajes: HOLA, clavesPlanes: ['P1', 'P2'] }),
    );
    expect(r.respuesta).toBe('Hola, ¿para qué usas tu auto?');
  });

  it('con cotización: la lee sin desglose (RN-41) y recomienda con su precio', async () => {
    const { useCase, resumen } = crear(
      cruda({ planes: [{ clave: 'P1', motivo: 'Se ajusta a ti' }] }),
    );
    const r = await useCase.ejecutar({ mensajes: HOLA, cotizacionId: 'cot-1' });
    expect(resumen).toHaveBeenCalledWith('cot-1', false);
    expect(r.planesRecomendados[0]!.primaAnual).toBe('439.13');
  });

  it('rechaza una conversación que no termina en un mensaje de la persona', async () => {
    const { useCase, responder } = crear();
    await expect(
      useCase.ejecutar({
        mensajes: [...HOLA, { rol: 'asistente', texto: 'Hola' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(responder).not.toHaveBeenCalled();
  });
});

describe('AsistenteSimuladoAdapter', () => {
  const entrada = {
    instrucciones: '',
    mensajes: [],
    clavesPlanes: ['P1', 'P2'],
  };

  it('fuera de producción contesta un texto fijo con el primer plan', async () => {
    const r = await new AsistenteSimuladoAdapter(false).responder(entrada);
    expect(r.respuesta).toContain('modo de prueba');
    expect(r.planes).toEqual([
      { clave: 'P1', motivo: 'Plan de ejemplo del modo de prueba.' },
    ]);
  });

  it('en producción no finge: 503', async () => {
    await expect(
      new AsistenteSimuladoAdapter(true).responder(entrada),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('Gemini · reintentos y razonamiento', () => {
  it('conReintento: reintenta una vez un fallo pasajero y devuelve el segundo resultado', async () => {
    const intento = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error('saturado'))
      .mockResolvedValueOnce('ok');
    await expect(conReintento(intento, () => true)).resolves.toBe('ok');
    expect(intento).toHaveBeenCalledTimes(2);
  });

  it('conReintento: no reintenta lo que no es pasajero ni pasa del número de veces', async () => {
    const noPasajero = jest.fn().mockRejectedValue(new Error('cuota'));
    await expect(conReintento(noPasajero, () => false)).rejects.toThrow(
      'cuota',
    );
    expect(noPasajero).toHaveBeenCalledTimes(1);

    const siempreFalla = jest.fn().mockRejectedValue(new Error('saturado'));
    await expect(conReintento(siempreFalla, () => true, 1)).rejects.toThrow(
      'saturado',
    );
    expect(siempreFalla).toHaveBeenCalledTimes(2);
  });

  it('esErrorPasajero: respuesta cortada, 5xx y tiempo agotado sí; cuota (429) y errores de petición no', () => {
    expect(esErrorPasajero(new RespuestaInvalidaError('cortada'))).toBe(true);
    for (const status of [500, 502, 503, 504])
      expect(esErrorPasajero({ status })).toBe(true);
    expect(
      esErrorPasajero(Object.assign(new Error('t'), { name: 'AbortError' })),
    ).toBe(true);
    for (const status of [400, 401, 404, 429])
      expect(esErrorPasajero({ status })).toBe(false);
    expect(esErrorPasajero(new Error('otra cosa'))).toBe(false);
  });

  it('configRazonamiento: apaga el razonamiento solo en 2.5-flash', () => {
    expect(configRazonamiento('gemini-2.5-flash')).toEqual({
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(configRazonamiento('gemini-2.5-flash-lite')).toEqual({
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(configRazonamiento('gemini-2.5-pro')).toEqual({});
    expect(configRazonamiento('gemini-3.5-flash')).toEqual({});
  });
});
