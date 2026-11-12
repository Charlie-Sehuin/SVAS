import {
  BadRequestException,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import type { ErrorCampo } from '../types/usuario-autenticado';

/**
 * Pipe global (arquitectura backend §3.1): descarta propiedades no declaradas
 * en el DTO, rechaza las desconocidas y convierte tipos. Los errores salen con
 * la forma { message, errors: [{ campo, mensaje }] } del doc de conexión §8.
 */
export function crearValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errores) => {
      const errors = aplanarErrores(errores);
      return new BadRequestException({
        message: errors[0]?.mensaje ?? 'Revisa los datos ingresados',
        errors,
      });
    },
  });
}

export function aplanarErrores(
  errores: ValidationError[],
  prefijo = '',
): ErrorCampo[] {
  return errores.flatMap((e) => {
    const campo = prefijo ? `${prefijo}.${e.property}` : e.property;
    const propios = Object.values(e.constraints ?? {}).map((mensaje) => ({
      campo,
      mensaje,
    }));
    return [...propios, ...aplanarErrores(e.children ?? [], campo)];
  });
}
