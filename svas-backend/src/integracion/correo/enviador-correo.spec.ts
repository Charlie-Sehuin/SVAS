import { EnviadorCorreoResendAdapter } from './enviador-correo-resend.adapter';
import { EnviadorCorreoSimuladoAdapter } from './enviador-correo-simulado.adapter';

const respuesta = (estado: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: estado });
const comoFetch = (f: jest.Mock) => f as unknown as typeof fetch;

describe('EnviadorCorreoResendAdapter', () => {
  it('manda el correo con el PDF en base64, la clave en la cabecera y la clave de idempotencia', async () => {
    const http = jest.fn().mockResolvedValue(respuesta(200, { id: 're_123' }));
    const adaptador = new EnviadorCorreoResendAdapter(
      're_clave_secreta',
      'SeguroSimple <hola@dominio.pe>',
      comoFetch(http),
    );
    const r = await adaptador.enviar({
      para: 'ana@correo.pe',
      asunto: 'Tu póliza',
      texto: 'texto plano',
      html: '<p>hola</p>',
      adjuntos: [
        {
          nombre: 'poliza.pdf',
          contenido: Buffer.from('PDF'),
          tipo: 'application/pdf',
        },
      ],
      claveIdempotencia: 'poliza-1',
    });

    expect(r).toEqual({ enviado: true, referencia: 're_123' });
    const [url, init] = http.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer re_clave_secreta',
      'Idempotency-Key': 'poliza-1',
    });
    const cuerpo = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(cuerpo).toMatchObject({
      from: 'SeguroSimple <hola@dominio.pe>',
      to: ['ana@correo.pe'],
      subject: 'Tu póliza',
      text: 'texto plano',
      html: '<p>hola</p>',
    });
    expect(cuerpo.attachments).toEqual([
      {
        filename: 'poliza.pdf',
        content: Buffer.from('PDF').toString('base64'),
      },
    ]);
  });

  it('sin html, adjuntos ni clave de idempotencia, no manda esos campos', async () => {
    const http = jest.fn().mockResolvedValue(respuesta(200, { id: 're_1' }));
    await new EnviadorCorreoResendAdapter(
      'k',
      'x <x@y.pe>',
      comoFetch(http),
    ).enviar({
      para: 'a@b.pe',
      asunto: 's',
      texto: 't',
    });
    const [, init] = http.mock.calls[0] as [string, RequestInit];
    const cuerpo = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(cuerpo).not.toHaveProperty('html');
    expect(cuerpo).not.toHaveProperty('attachments');
    expect(init.headers).not.toHaveProperty('Idempotency-Key');
  });

  it('si Resend rechaza el envío (p. ej. 403), lanza con el código y sin mostrar la clave', async () => {
    const http = jest
      .fn()
      .mockResolvedValue(
        respuesta(403, {
          message: 'You can only send testing emails to your own email address',
        }),
      );
    const error = await new EnviadorCorreoResendAdapter(
      're_clave_secreta',
      'x <x@y.pe>',
      comoFetch(http),
    )
      .enviar({ para: 'otro@correo.pe', asunto: 's', texto: 't' })
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('403');
    expect((error as Error).message).not.toContain('re_clave_secreta');
  });
});

describe('EnviadorCorreoSimuladoAdapter', () => {
  it('no envía nada: devuelve una referencia SIM- y no lanza', async () => {
    const r = await new EnviadorCorreoSimuladoAdapter().enviar({
      para: 'ana@correo.pe',
      asunto: 'Tu póliza',
      texto: 'x',
      adjuntos: [
        {
          nombre: 'p.pdf',
          contenido: Buffer.from('x'),
          tipo: 'application/pdf',
        },
      ],
    });
    expect(r.enviado).toBe(true);
    expect(r.referencia).toMatch(/^SIM-/);
  });
});
