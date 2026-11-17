import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  AsistenteConversacional,
  EntradaAsistente,
  RespuestaCruda,
} from '../../modules/asistente/domain/asistente-conversacional.port';
import {
  AsistenteConRespaldoAdapter,
  PLAZO_MAXIMO_RESPALDO_MS,
  PRESUPUESTO_MS,
  type AsistenteRespaldo,
} from './asistente-con-respaldo.adapter';
import {
  AsistenteDeepSeekAdapter,
  instruccionesConFormato,
  URL_DEEPSEEK,
} from './asistente-deepseek.adapter';

const ENTRADA: EntradaAsistente = {
  instrucciones: 'Reglas y planes',
  mensajes: [
    { rol: 'usuario', texto: 'Hola' },
    { rol: 'asistente', texto: '¿Para qué usas tu auto?' },
    { rol: 'usuario', texto: 'Para trabajar' },
  ],
  clavesPlanes: ['P1', 'P2'],
};

const CRUDA: RespuestaCruda = {
  respuesta: 'Te recomiendo P1',
  planes: [{ clave: 'P1', motivo: 'Cubre lo que te preocupa' }],
  acciones: ['COTIZAR'],
};

/** Respuesta HTTP mínima, como la de `fetch`. */
function http(status: number, cuerpo: unknown): Response {
  return new Response(
    typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

const exito = (contenido: string, finish_reason = 'stop') =>
  http(200, { choices: [{ message: { content: contenido }, finish_reason }] });

describe('AsistenteDeepSeekAdapter', () => {
  it('pide modo JSON sin razonamiento, con las instrucciones como mensaje de sistema y los roles traducidos', async () => {
    const fetchFn = jest.fn().mockResolvedValue(exito(JSON.stringify(CRUDA)));
    const adapter = new AsistenteDeepSeekAdapter(
      'clave',
      'deepseek-v4-flash',
      fetchFn,
    );

    await expect(adapter.responder(ENTRADA)).resolves.toEqual(CRUDA);

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_DEEPSEEK);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer clave',
    );
    const cuerpo = JSON.parse(init.body as string);
    expect(cuerpo.model).toBe('deepseek-v4-flash');
    expect(cuerpo.response_format).toEqual({ type: 'json_object' });
    expect(cuerpo.thinking).toEqual({ type: 'disabled' });
    expect(cuerpo.messages.map((m: { role: string }) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
    expect(cuerpo.messages[0].content).toContain('Reglas y planes');
  });

  it('las instrucciones piden JSON y nombran las claves y acciones válidas', () => {
    const texto = instruccionesConFormato(ENTRADA);
    expect(texto).toContain('JSON');
    expect(texto).toContain('P1, P2');
    expect(texto).toContain('HABLAR_ASESOR');
  });

  it('completa planes y acciones que falten con listas vacías', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(exito(JSON.stringify({ respuesta: 'Hola' })));
    const r = await new AsistenteDeepSeekAdapter('c', 'm', fetchFn).responder(
      ENTRADA,
    );
    expect(r).toEqual({ respuesta: 'Hola', planes: [], acciones: [] });
  });

  it('reintenta una vez si la respuesta llega cortada o con 5xx', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(exito('{"respuesta": "Hol', 'length'))
      .mockResolvedValueOnce(exito(JSON.stringify(CRUDA)));
    const r = await new AsistenteDeepSeekAdapter('c', 'm', fetchFn).responder(
      ENTRADA,
    );
    expect(r).toEqual(CRUDA);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    const conFallo = jest
      .fn()
      .mockResolvedValueOnce(http(503, 'saturado'))
      .mockResolvedValueOnce(exito(JSON.stringify(CRUDA)));
    await expect(
      new AsistenteDeepSeekAdapter('c', 'm', conFallo).responder(ENTRADA),
    ).resolves.toEqual(CRUDA);
  });

  it('sin saldo (402) o con demasiadas peticiones (429): 503 sin reintentar', async () => {
    for (const status of [402, 429]) {
      const fetchFn = jest.fn().mockResolvedValue(http(status, 'no'));
      await expect(
        new AsistenteDeepSeekAdapter('c', 'm', fetchFn).responder(ENTRADA),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    }
  });

  it('otro fallo (clave inválida, JSON roto tras el reintento): 502', async () => {
    const sinPermiso = jest.fn().mockResolvedValue(http(401, 'clave'));
    await expect(
      new AsistenteDeepSeekAdapter('c', 'm', sinPermiso).responder(ENTRADA),
    ).rejects.toBeInstanceOf(BadGatewayException);

    const roto = jest.fn().mockResolvedValue(exito('no es json'));
    await expect(
      new AsistenteDeepSeekAdapter('c', 'm', roto).responder(ENTRADA),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(roto).toHaveBeenCalledTimes(2);
  });

  it('responderUnaVez: un solo intento', async () => {
    const fetchFn = jest.fn().mockResolvedValue(http(503, 'saturado'));
    await expect(
      new AsistenteDeepSeekAdapter('c', 'm', fetchFn).responderUnaVez(
        ENTRADA,
        5_000,
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('AsistenteConRespaldoAdapter', () => {
  function crear(opciones: {
    principal: () => Promise<RespuestaCruda>;
    respaldo?: () => Promise<RespuestaCruda>;
    /** Milisegundos que "tarda" el principal. */
    demora?: number;
  }) {
    let reloj = 0;
    const principal = {
      responder: jest.fn(() => {
        reloj += opciones.demora ?? 0;
        return opciones.principal();
      }),
    } satisfies AsistenteConversacional;
    const respaldo = {
      responderUnaVez: jest.fn(
        opciones.respaldo ?? (() => Promise.resolve(CRUDA)),
      ),
    } satisfies AsistenteRespaldo;
    const adapter = new AsistenteConRespaldoAdapter(
      principal,
      respaldo,
      () => reloj,
    );
    return { adapter, principal, respaldo };
  }

  it('si el principal responde, el respaldo no se usa', async () => {
    const { adapter, respaldo } = crear({
      principal: () => Promise.resolve(CRUDA),
    });
    await expect(adapter.responder(ENTRADA)).resolves.toEqual(CRUDA);
    expect(respaldo.responderUnaVez).not.toHaveBeenCalled();
  });

  it('si el principal falla rápido, responde el respaldo con un plazo acotado', async () => {
    const { adapter, respaldo } = crear({
      principal: () =>
        Promise.reject(new ServiceUnavailableException('cuota agotada')),
      demora: 300,
    });
    await expect(adapter.responder(ENTRADA)).resolves.toEqual(CRUDA);
    expect(respaldo.responderUnaVez).toHaveBeenCalledWith(
      ENTRADA,
      PLAZO_MAXIMO_RESPALDO_MS,
    );
  });

  it('el plazo del respaldo es lo que le queda a la petición', async () => {
    const { adapter, respaldo } = crear({
      principal: () => Promise.reject(new BadGatewayException('falló')),
      demora: 9_000,
    });
    await adapter.responder(ENTRADA);
    expect(respaldo.responderUnaVez).toHaveBeenCalledWith(
      ENTRADA,
      PRESUPUESTO_MS - 9_000,
    );
  });

  it('si ya no queda tiempo, no intenta el respaldo y devuelve el error del principal', async () => {
    const error = new BadGatewayException('falló');
    const { adapter, respaldo } = crear({
      principal: () => Promise.reject(error),
      demora: 13_000,
    });
    await expect(adapter.responder(ENTRADA)).rejects.toBe(error);
    expect(respaldo.responderUnaVez).not.toHaveBeenCalled();
  });

  it('si el respaldo también falla, devuelve el error del principal', async () => {
    const error = new ServiceUnavailableException('muy ocupado');
    const { adapter } = crear({
      principal: () => Promise.reject(error),
      respaldo: () => Promise.reject(new BadGatewayException('otro')),
    });
    await expect(adapter.responder(ENTRADA)).rejects.toBe(error);
  });
});
