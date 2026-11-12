/**
 * Textos de los mensajes al cliente (contexto §8.5, RN-12). Funciones puras.
 * El mensaje final suma la frase de contraste de la Prueba de Choque (RN-35)
 * cuando la cotización tiene una simulación vigente.
 */

/** Token de retoma: 32 bytes en base64url (lo genera el RPC). */
export const FORMATO_TOKEN_RETOMA = /^[A-Za-z0-9_-]{43}$/;

export function urlRetoma(frontendUrl: string, token: string): string {
  return `${frontendUrl.replace(/\/+$/, '')}/retoma/${token}`;
}

const primerNombre = (nombres: string) =>
  nombres.trim().split(/\s+/)[0] || 'hola';

/** Tras un intento ACEPTA: el asesor reenvía el enlace de compra. */
export function mensajeEnlaceCompra(nombres: string, url: string): string {
  return (
    `Hola ${primerNombre(nombres)}, como conversamos, aquí tienes el enlace ` +
    `para completar la compra de tu seguro vehicular: ${url} ` +
    `(es de un solo uso).`
  );
}

/** Al cerrar como DESCARTADO: un único mensaje final con el enlace de retoma (+ RN-35). */
export function mensajeFinal(
  nombres: string,
  url: string,
  contraste: string | null = null,
): string {
  return (
    `Hola ${primerNombre(nombres)}, gracias por cotizar con nosotros. ` +
    (contraste ? `Un dato de tu Prueba de Choque: ${contraste} ` : '') +
    `Si más adelante quieres asegurar tu vehículo, retoma tu cotización aquí ` +
    `y obtén un descuento de primera compra: ${url} (es de un solo uso).`
  );
}
