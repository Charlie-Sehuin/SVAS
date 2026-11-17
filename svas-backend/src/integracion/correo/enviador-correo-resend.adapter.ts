import type {
  CorreoSaliente,
  EnviadorCorreo,
} from '../../modules/polizas/domain/enviador-correo.port';

const URL_RESEND = 'https://api.resend.com/emails';
const ESPERA_MAXIMA_MS = 15_000;

/**
 * Correo real con Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Sin dominio verificado, Resend solo entrega al correo de la cuenta dueña de la clave
 * (remitente onboarding@resend.dev): a cualquier otro responde 403. Con un dominio
 * verificado, CORREO_REMITENTE debe usar ese dominio.
 */
export class EnviadorCorreoResendAdapter implements EnviadorCorreo {
  constructor(
    private readonly apiKey: string,
    private readonly remitente: string,
    /** Inyectable para las pruebas. */
    private readonly http: typeof fetch = fetch,
  ) {}

  async enviar(c: CorreoSaliente) {
    const respuesta = await this.http(URL_RESEND, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(c.claveIdempotencia
          ? { 'Idempotency-Key': c.claveIdempotencia }
          : {}),
      },
      body: JSON.stringify({
        from: this.remitente,
        to: [c.para],
        subject: c.asunto,
        text: c.texto,
        ...(c.html ? { html: c.html } : {}),
        ...(c.adjuntos?.length
          ? {
              attachments: c.adjuntos.map((a) => ({
                filename: a.nombre,
                content: a.contenido.toString('base64'),
              })),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
    });

    if (!respuesta.ok) {
      // El mensaje de error del proveedor no lleva la clave; se recorta por si trae el correo del destinatario.
      const detalle = (await respuesta.text().catch(() => '')).slice(0, 160);
      throw new Error(`Resend respondió ${respuesta.status}: ${detalle}`);
    }
    const cuerpo = (await respuesta.json().catch(() => ({}))) as {
      id?: string;
    };
    return { enviado: true, referencia: cuerpo.id };
  }
}
