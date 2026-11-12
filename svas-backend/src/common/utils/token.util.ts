import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Tokens opacos (X-Cotizacion-Token, enlace de retoma). En la base solo se
 * guarda sha256(token); el token en claro se entrega una sola vez.
 */
export function generarToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex');
}

/** Compara sha256(token) con el hash guardado en tiempo constante. */
export function tokenCoincide(token: string, hashGuardado: string): boolean {
  const calculado = Buffer.from(sha256Hex(token), 'hex');
  const guardado = Buffer.from(hashGuardado, 'hex');
  return (
    calculado.length === guardado.length && timingSafeEqual(calculado, guardado)
  );
}
