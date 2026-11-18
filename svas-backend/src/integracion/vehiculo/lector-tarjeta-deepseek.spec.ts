import { BadGatewayException, BadRequestException } from '@nestjs/common';
import type {
  LectorTarjeta,
  TarjetaCruda,
} from '../../modules/cotizacion/domain/lector-tarjeta.port';
import { URL_DEEPSEEK } from '../asistente/asistente-deepseek.adapter';
import { LectorTarjetaConRespaldoAdapter } from './lector-tarjeta-con-respaldo.adapter';
import { LectorTarjetaDeepSeekAdapter } from './lector-tarjeta-deepseek.adapter';

const CATALOGO = [{ marca: 'Volkswagen', modelos: ['Jetta', 'Golf'] }];
const FOTO = { datos: Buffer.from('abc'), mimeType: 'image/png' };
const PDF = { datos: Buffer.from('%PDF'), mimeType: 'application/pdf' };
const CRUDA: TarjetaCruda = {
  placa: 'ADQ345',
  marca: 'Volkswagen',
  modelo: 'Jetta',
  anio: 2011,
};

const http = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const exito = (contenido: string) =>
  http(200, { choices: [{ message: { content: contenido } }] });

describe('LectorTarjetaDeepSeekAdapter', () => {
  it('manda la imagen en base64, pide modo JSON sin razonamiento y devuelve los 4 datos', async () => {
    const fetchFn = jest.fn().mockResolvedValue(exito(JSON.stringify(CRUDA)));
    const adapter = new LectorTarjetaDeepSeekAdapter(
      'clave',
      'deepseek-flash',
      fetchFn,
    );

    await expect(adapter.leer(FOTO, CATALOGO)).resolves.toEqual(CRUDA);

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_DEEPSEEK);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer clave',
    );
    const cuerpo = JSON.parse(init.body as string);
    expect(cuerpo.model).toBe('deepseek-flash');
    expect(cuerpo.response_format).toEqual({ type: 'json_object' });
    expect(cuerpo.thinking).toEqual({ type: 'disabled' });
    expect(cuerpo.messages[0].content).toContain('Volkswagen: Jetta, Golf');
    expect(cuerpo.messages[0].content).toContain('JSON');
    expect(cuerpo.messages[1].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${FOTO.datos.toString('base64')}` },
    });
  });

  it('un PDF se rechaza sin llamar a la API', async () => {
    const fetchFn = jest.fn();
    const adapter = new LectorTarjetaDeepSeekAdapter('c', 'm', fetchFn);
    await expect(adapter.leer(PDF, CATALOGO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('un error HTTP (p. ej. 402 sin saldo) da 502', async () => {
    const fetchFn = jest.fn().mockResolvedValue(http(402, { error: 'saldo' }));
    const adapter = new LectorTarjetaDeepSeekAdapter('c', 'm', fetchFn);
    await expect(adapter.leer(FOTO, CATALOGO)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('el modo JSON a veces devuelve solo espacios: es un fallo, no una lectura vacía', async () => {
    const fetchFn = jest.fn().mockResolvedValue(exito('   '));
    const adapter = new LectorTarjetaDeepSeekAdapter('c', 'm', fetchFn);
    await expect(adapter.leer(FOTO, CATALOGO)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});

describe('LectorTarjetaConRespaldoAdapter', () => {
  const lector = (r: () => Promise<TarjetaCruda>) => ({
    leer: jest.fn(r),
  });

  it('si el principal lee, el respaldo no se usa', async () => {
    const principal = lector(() => Promise.resolve(CRUDA));
    const respaldo = lector(() => Promise.reject(new Error('no debe usarse')));
    const adapter = new LectorTarjetaConRespaldoAdapter(
      principal as LectorTarjeta,
      respaldo as LectorTarjeta,
    );
    await expect(adapter.leer(FOTO, CATALOGO)).resolves.toEqual(CRUDA);
    expect(respaldo.leer).not.toHaveBeenCalled();
  });

  it('si el principal falla (o es un PDF), lee el respaldo', async () => {
    const principal = lector(() => Promise.reject(new Error('sin saldo')));
    const respaldo = lector(() => Promise.resolve(CRUDA));
    const adapter = new LectorTarjetaConRespaldoAdapter(
      principal as LectorTarjeta,
      respaldo as LectorTarjeta,
    );
    await expect(adapter.leer(PDF, CATALOGO)).resolves.toEqual(CRUDA);
    expect(respaldo.leer).toHaveBeenCalledWith(PDF, CATALOGO);
  });

  it('si fallan los dos, devuelve el error del respaldo', async () => {
    const principal = lector(() => Promise.reject(new Error('uno')));
    const respaldo = lector(() => Promise.reject(new Error('dos')));
    const adapter = new LectorTarjetaConRespaldoAdapter(
      principal as LectorTarjeta,
      respaldo as LectorTarjeta,
    );
    await expect(adapter.leer(FOTO, CATALOGO)).rejects.toThrow('dos');
  });
});
