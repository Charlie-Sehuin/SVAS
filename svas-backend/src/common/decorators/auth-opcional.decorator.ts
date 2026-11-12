import { SetMetadata } from '@nestjs/common';

export const AUTH_OPCIONAL = 'authOpcional';

/**
 * La ruta acepta JWT pero no lo exige (doc conexión §2: "Bearer o
 * X-Cotizacion-Token"). Si llega un JWT se verifica igual que siempre (uno
 * inválido da 401); si no llega, pasa sin usuario y otro guard decide
 * (p. ej. CotizacionAccesoGuard con el token de la cotización).
 */
export const AuthOpcional = () => SetMetadata(AUTH_OPCIONAL, true);
