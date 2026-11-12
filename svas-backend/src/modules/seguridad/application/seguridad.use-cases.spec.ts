import { BadRequestException, ConflictException } from '@nestjs/common';
import type { RolesGuard } from '../../../common/guards/roles.guard';
import {
  ContrasenaDebilError,
  EmailYaRegistradoError,
  type ProveedorIdentidad,
} from '../domain/proveedor-identidad.port';
import type { Usuario } from '../domain/usuario';
import type { UsuarioRepository } from '../domain/usuario.repository.port';
import {
  CambiarEstadoUsuarioUseCase,
  CambiarRolUsuarioUseCase,
  CrearUsuarioInternoUseCase,
} from './administrar-usuarios.use-cases';
import { RegistrarClienteUseCase } from './registrar-cliente.use-case';

const usuario = (cambios: Partial<Usuario> = {}): Usuario => ({
  id: 'u1',
  email: 'ana@test.com',
  rol: 'CLIENTE',
  nombreCompleto: 'Ana Pérez',
  activo: true,
  ...cambios,
});

function dobles() {
  const identidad = {
    crearCuenta: jest.fn().mockResolvedValue({ id: 'u1' }),
    eliminarCuenta: jest.fn().mockResolvedValue(undefined),
    bloquear: jest.fn().mockResolvedValue(undefined),
  } satisfies jest.Mocked<ProveedorIdentidad>;
  const repo = {
    buscarPorId: jest.fn().mockResolvedValue(usuario()),
    registrarCliente: jest.fn().mockResolvedValue(usuario()),
    listar: jest.fn(),
    registrarInterno: jest.fn(),
    cambiarRol: jest.fn(),
    cambiarEstado: jest.fn(),
  } satisfies jest.Mocked<UsuarioRepository>;
  const invalidar = jest.fn();
  const rolesGuard = { invalidar } as unknown as RolesGuard;
  return { identidad, repo, rolesGuard, invalidar };
}

describe('RegistrarClienteUseCase', () => {
  const datos = {
    nombres: ' Ana ',
    apellidos: 'Pérez  Gómez',
    email: 'ana@test.com',
    password: 'secreta123',
    telefono: '987654321',
  };

  it('crea la cuenta y el perfil CLIENTE y devuelve el perfil', async () => {
    const { identidad, repo } = dobles();
    const r = await new RegistrarClienteUseCase(identidad, repo).ejecutar(
      datos,
    );

    expect(identidad.crearCuenta).toHaveBeenCalledWith(
      'ana@test.com',
      'secreta123',
    );
    expect(repo.registrarCliente).toHaveBeenCalledWith({
      id: 'u1',
      email: 'ana@test.com',
      nombreCompleto: 'Ana Pérez Gómez',
      contacto: {
        nombres: ' Ana ',
        apellidos: 'Pérez  Gómez',
        telefono: '987654321',
      },
      cotizacionId: undefined,
      tokenHash: undefined,
    });
    expect(r).toEqual(usuario());
  });

  it('con cotizacionId exige el token ANTES de crear la cuenta', async () => {
    const { identidad, repo } = dobles();
    await expect(
      new RegistrarClienteUseCase(identidad, repo).ejecutar({
        ...datos,
        cotizacionId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(identidad.crearCuenta).not.toHaveBeenCalled();
  });

  it('con cotizacionId y token pasa el sha256 del token, nunca el token', async () => {
    const { identidad, repo } = dobles();
    await new RegistrarClienteUseCase(identidad, repo).ejecutar({
      ...datos,
      cotizacionId: '11111111-1111-4111-8111-111111111111',
      tokenAcceso: 'token-en-claro',
    });
    const llamada = repo.registrarCliente.mock.calls[0][0] as {
      tokenHash?: string;
    };
    expect(llamada.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(llamada)).not.toContain('token-en-claro');
  });

  it('409 si el email ya existe', async () => {
    const { identidad, repo } = dobles();
    identidad.crearCuenta.mockRejectedValue(new EmailYaRegistradoError());
    await expect(
      new RegistrarClienteUseCase(identidad, repo).ejecutar(datos),
    ).rejects.toThrow(ConflictException);
  });

  it('400 si Supabase considera débil la contraseña', async () => {
    const { identidad, repo } = dobles();
    identidad.crearCuenta.mockRejectedValue(new ContrasenaDebilError());
    await expect(
      new RegistrarClienteUseCase(identidad, repo).ejecutar(datos),
    ).rejects.toThrow(BadRequestException);
  });

  it('si falla el perfil, elimina la cuenta de Auth (compensación) y propaga el error', async () => {
    const { identidad, repo } = dobles();
    repo.registrarCliente.mockRejectedValue(new Error('db caída'));
    await expect(
      new RegistrarClienteUseCase(identidad, repo).ejecutar(datos),
    ).rejects.toThrow('db caída');
    expect(identidad.eliminarCuenta).toHaveBeenCalledWith('u1');
  });
});

describe('CrearUsuarioInternoUseCase', () => {
  it('crea con contraseña temporal y la devuelve una vez', async () => {
    const { identidad, repo } = dobles();
    repo.registrarInterno.mockResolvedValue(usuario({ rol: 'ASESOR' }));

    const r = await new CrearUsuarioInternoUseCase(identidad, repo).ejecutar(
      'tok',
      {
        email: 'asesor@test.com',
        nombreCompleto: 'Luis Asesor',
        rol: 'ASESOR',
      },
    );

    const contrasena = identidad.crearCuenta.mock.calls[0][1] as string;
    expect(contrasena).toHaveLength(16);
    expect(r.contrasenaTemporal).toBe(contrasena);
    expect(repo.registrarInterno).toHaveBeenCalledWith('tok', {
      id: 'u1',
      email: 'asesor@test.com',
      nombreCompleto: 'Luis Asesor',
      rol: 'ASESOR',
    });
  });

  it('si el RPC rechaza (p. ej. el que llama ya no es admin), elimina la cuenta creada', async () => {
    const { identidad, repo } = dobles();
    repo.registrarInterno.mockRejectedValue(new Error('No tienes permiso'));
    await expect(
      new CrearUsuarioInternoUseCase(identidad, repo).ejecutar('tok', {
        email: 'x@test.com',
        nombreCompleto: 'X',
        rol: 'ASESOR',
      }),
    ).rejects.toThrow('No tienes permiso');
    expect(identidad.eliminarCuenta).toHaveBeenCalledWith('u1');
  });
});

describe('CambiarRolUsuarioUseCase', () => {
  it('llama al RPC con el token del admin e invalida la caché del guard', async () => {
    const { repo, rolesGuard, invalidar } = dobles();
    repo.cambiarRol.mockResolvedValue(
      usuario({ id: 'u2', rol: 'ADMINISTRADOR' }),
    );
    await new CambiarRolUsuarioUseCase(repo, rolesGuard).ejecutar(
      'tok',
      'u2',
      'ADMINISTRADOR',
    );
    expect(repo.cambiarRol).toHaveBeenCalledWith('tok', 'u2', 'ADMINISTRADOR');
    expect(invalidar).toHaveBeenCalledWith('u2');
  });
});

describe('CambiarEstadoUsuarioUseCase', () => {
  it('al desactivar: RPC, invalida caché y bloquea en Auth', async () => {
    const { identidad, repo, rolesGuard, invalidar } = dobles();
    repo.cambiarEstado.mockResolvedValue(usuario({ id: 'u2', activo: false }));
    await new CambiarEstadoUsuarioUseCase(repo, identidad, rolesGuard).ejecutar(
      'tok',
      'u2',
      false,
    );
    expect(invalidar).toHaveBeenCalledWith('u2');
    expect(identidad.bloquear).toHaveBeenCalledWith('u2', true);
  });

  it('al activar: desbloquea en Auth', async () => {
    const { identidad, repo, rolesGuard } = dobles();
    repo.cambiarEstado.mockResolvedValue(usuario({ id: 'u2', activo: true }));
    await new CambiarEstadoUsuarioUseCase(repo, identidad, rolesGuard).ejecutar(
      'tok',
      'u2',
      true,
    );
    expect(identidad.bloquear).toHaveBeenCalledWith('u2', false);
  });

  it('si falla el bloqueo en Auth no revierte: el RolesGuard ya corta el acceso', async () => {
    const { identidad, repo, rolesGuard } = dobles();
    repo.cambiarEstado.mockResolvedValue(usuario({ id: 'u2', activo: false }));
    identidad.bloquear.mockRejectedValue(new Error('auth caído'));
    await expect(
      new CambiarEstadoUsuarioUseCase(repo, identidad, rolesGuard).ejecutar(
        'tok',
        'u2',
        false,
      ),
    ).resolves.toMatchObject({ activo: false });
  });

  it('si el RPC rechaza (último admin), no toca Auth ni la caché', async () => {
    const { identidad, repo, rolesGuard, invalidar } = dobles();
    repo.cambiarEstado.mockRejectedValue(
      new Error('Debe quedar al menos un administrador activo'),
    );
    await expect(
      new CambiarEstadoUsuarioUseCase(repo, identidad, rolesGuard).ejecutar(
        'tok',
        'u2',
        false,
      ),
    ).rejects.toThrow(/administrador activo/);
    expect(identidad.bloquear).not.toHaveBeenCalled();
    expect(invalidar).not.toHaveBeenCalled();
  });
});
