import { IsIn, IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  CANAL_CONTACTO,
  type CanalContacto,
} from '../../../../shared/types/enums';

/**
 * PATCH /usuarios/me/contacto. Solo se puede cambiar el celular y el canal preferido: el correo es el usuario de
 * login (cambiarlo pide confirmación por correo) y nombres, apellidos y documento no se editan desde aquí.
 * Cualquier otra propiedad se rechaza (whitelist + forbidNonWhitelisted del ValidationPipe).
 */
export class ActualizarContactoDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '') : value,
  )
  @Matches(/^9\d{8}$/, {
    message: 'Ingresa un celular peruano de 9 dígitos que empiece con 9',
  })
  telefono?: string;

  @IsOptional()
  @IsIn(CANAL_CONTACTO, { message: 'El canal debe ser LLAMADA o WHATSAPP' })
  canal?: CanalContacto;
}
