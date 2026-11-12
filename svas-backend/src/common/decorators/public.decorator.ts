import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO = 'esPublico';

/** La ruta no exige JWT. Solo para los endpoints que el doc de conexión §2 marca públicos. */
export const Public = () => SetMetadata(ES_PUBLICO, true);
