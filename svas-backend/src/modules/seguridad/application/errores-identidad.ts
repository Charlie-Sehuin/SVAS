import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  ContrasenaDebilError,
  EmailYaRegistradoError,
} from '../domain/proveedor-identidad.port';

/** Errores del proveedor de identidad → HTTP con mensaje para el usuario. */
export function traducirErrorIdentidad(error: unknown): never {
  if (error instanceof EmailYaRegistradoError) {
    throw new ConflictException('Ya existe una cuenta con ese email');
  }
  if (error instanceof ContrasenaDebilError) {
    throw new BadRequestException(
      'La contraseña es muy débil. Usa una más larga o más variada.',
    );
  }
  throw error;
}
