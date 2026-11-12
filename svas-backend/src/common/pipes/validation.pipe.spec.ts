import { BadRequestException } from '@nestjs/common';
import { IsEmail, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { crearValidationPipe } from './validation.pipe';

class DireccionDto {
  @IsString({ message: 'El distrito es obligatorio' })
  distrito!: string;
}

class RegistroDto {
  @IsEmail({}, { message: 'El email no es válido' })
  email!: string;

  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password!: string;

  @ValidateNested()
  @Type(() => DireccionDto)
  direccion!: DireccionDto;
}

describe('crearValidationPipe', () => {
  const pipe = crearValidationPipe();
  const meta = { type: 'body' as const, metatype: RegistroDto };

  it('devuelve errors[] por campo (incluye anidados) y el primero como message', async () => {
    const error = await pipe
      .transform({ email: 'x', password: '123', direccion: {} }, meta)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    const cuerpo = (error as BadRequestException).getResponse() as {
      message: string;
      errors: { campo: string; mensaje: string }[];
    };
    expect(cuerpo.message).toBe('El email no es válido');
    expect(cuerpo.errors).toEqual([
      { campo: 'email', mensaje: 'El email no es válido' },
      {
        campo: 'password',
        mensaje: 'La contraseña debe tener al menos 8 caracteres',
      },
      { campo: 'direccion.distrito', mensaje: 'El distrito es obligatorio' },
    ]);
  });

  it('rechaza propiedades no declaradas (p. ej. intentar asignarse un rol)', async () => {
    const error = await pipe
      .transform(
        {
          email: 'a@b.com',
          password: '12345678',
          direccion: { distrito: 'x' },
          rol: 'ADMINISTRADOR',
        },
        meta,
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(
      JSON.stringify((error as BadRequestException).getResponse()),
    ).toContain('rol');
  });
});
