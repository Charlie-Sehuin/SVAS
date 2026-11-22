import { BadRequestException } from '@nestjs/common';
import { crearValidationPipe } from '../../../../common/pipes/validation.pipe';
import { limpiarBusqueda } from '../../infrastructure/usuario-supabase.repository';
import { ActualizarContactoDto } from './actualizar-contacto.dto';
import { RegistroDto } from './registro.dto';
import { CrearUsuarioDto, ListarUsuariosQuery } from './usuarios.dto';

const pipe = crearValidationPipe();
const validar = <T>(
  metatype: new () => T,
  valor: unknown,
  type: 'body' | 'query' = 'body',
) => pipe.transform(valor, { type, metatype }) as Promise<T>;

const errores = async (p: Promise<unknown>) => {
  const e = await p.catch((x: unknown) => x);
  expect(e).toBeInstanceOf(BadRequestException);
  return (
    (e as BadRequestException).getResponse() as { errors: { campo: string }[] }
  ).errors.map((x) => x.campo);
};

describe('RegistroDto', () => {
  const valido = {
    nombres: 'Ana',
    apellidos: 'Pérez',
    email: '  Ana@Test.COM ',
    password: 'secreta123',
    telefono: '987 654-321',
  };

  it('normaliza email y teléfono', async () => {
    const dto = await validar(RegistroDto, valido);
    expect(dto.email).toBe('ana@test.com');
    expect(dto.telefono).toBe('987654321');
  });

  it('rechaza intentar auto-asignarse un rol', async () => {
    expect(
      await errores(validar(RegistroDto, { ...valido, rol: 'ADMINISTRADOR' })),
    ).toContain('rol');
  });

  it('valida contraseña corta, teléfono no peruano y email inválido', async () => {
    const campos = await errores(
      validar(RegistroDto, {
        ...valido,
        password: '123',
        telefono: '123',
        email: 'x',
      }),
    );
    expect(campos).toEqual(
      expect.arrayContaining(['password', 'telefono', 'email']),
    );
  });
});

describe('ActualizarContactoDto', () => {
  it('normaliza el celular (quita espacios y guiones) y acepta el canal', async () => {
    const dto = await validar(ActualizarContactoDto, {
      telefono: '911 222-333',
      canal: 'LLAMADA',
    });
    expect(dto.telefono).toBe('911222333');
    expect(dto.canal).toBe('LLAMADA');
  });

  it('acepta cambiar solo uno de los dos', async () => {
    expect(
      (await validar(ActualizarContactoDto, { canal: 'WHATSAPP' })).canal,
    ).toBe('WHATSAPP');
    expect(
      (await validar(ActualizarContactoDto, { telefono: '911222333' }))
        .telefono,
    ).toBe('911222333');
  });

  it('rechaza un celular que no es peruano y un canal desconocido', async () => {
    const campos = await errores(
      validar(ActualizarContactoDto, { telefono: '811222333', canal: 'SMS' }),
    );
    expect(campos).toEqual(expect.arrayContaining(['telefono', 'canal']));
  });

  it('no deja cambiar el correo, los nombres ni el documento por aquí', async () => {
    const campos = await errores(
      validar(ActualizarContactoDto, {
        telefono: '911222333',
        email: 'otro@correo.com',
        nombres: 'Otra',
        numeroDocumento: '12345678',
      }),
    );
    expect(campos).toEqual(
      expect.arrayContaining(['email', 'nombres', 'numeroDocumento']),
    );
  });
});

describe('CrearUsuarioDto', () => {
  it('no permite crear CLIENTE desde administración', async () => {
    expect(
      await errores(
        validar(CrearUsuarioDto, {
          email: 'a@b.com',
          nombreCompleto: 'Ana Pérez',
          rol: 'CLIENTE',
        }),
      ),
    ).toEqual(['rol']);
  });
});

describe('ListarUsuariosQuery', () => {
  it('convierte los query params y aplica valores por defecto', async () => {
    const q = await validar(
      ListarUsuariosQuery,
      { activo: 'false', pagina: '2' },
      'query',
    );
    expect(q).toMatchObject({ activo: false, pagina: 2, tamano: 20 });
  });

  it('limita tamano a 100', async () => {
    expect(
      await errores(validar(ListarUsuariosQuery, { tamano: '500' }, 'query')),
    ).toEqual(['tamano']);
  });
});

describe('limpiarBusqueda', () => {
  it('conserva letras con tilde, ñ, @ y punto', () => {
    expect(limpiarBusqueda(' Muñoz ana@test.com ')).toBe('Muñoz ana@test.com');
  });

  it('quita la sintaxis de PostgREST para impedir inyectar filtros', () => {
    expect(limpiarBusqueda('x*,rol.eq.ADMINISTRADOR),(activo.eq.true')).toBe(
      'xrol.eq.ADMINISTRADORactivo.eq.true',
    );
    expect(limpiarBusqueda(undefined)).toBe('');
  });
});
