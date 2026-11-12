import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RolesGuard } from '../../../common/guards/roles.guard';
import {
  ContrasenaDebilError,
  CredencialesInvalidasError,
  CuentaBloqueadaError,
  EmailYaRegistradoError,
  type ProveedorIdentidad,
  SesionInvalidaError,
} from '../domain/proveedor-identidad.port';
import type { Sesion, Usuario } from '../domain/usuario';
import type { UsuarioRepository } from '../domain/usuario.repository.port';
import {
  CambiarEstadoUsuarioUseCase,
  CambiarRolUsuarioUseCase,
  CrearUsuarioInternoUseCase,
} from './administrar-usuarios.use-cases';
import { IniciarSesionUseCase } from './iniciar-sesion.use-case';
import { RefrescarSesionUseCase } from './refrescar-sesion.use-case';
import { RegistrarClienteUseCase } from './registrar-cliente.use-case';
import { SesionAutorizadaService } from './sesion-autorizada.service';

const SESION: Sesion = {
  accessToken: 'at',
  refreshToken: 'rt',
  expiresIn: 3600,
  usuarioId: 'u1',
};

const usuario = (cambios: Partial<Usuario> = {}): Usuario => ({
  id: 'u1',
  email: 'ana@test.com',
  rol: 'CLIENTE',
  nombreCompleto: 'Ana Pérez',
  activo: true,
  ...cambios,
});

function dobles() {
  const identidad: jest.Mocked<ProveedorIdentidad> = {
    iniciarSesion: jest.fn().mockResolvedValue(SESION),
    refrescar: jest.fn().mockResolvedValue(SESION),
    crearCuenta: jest.fn().mockResolvedValue({ id: 'u1' }),
    eliminarCuenta: jest.fn().mockResolvedValue(undefined),
    bloquear: jest.fn().mockResolvedValue(undefined),
  };
  const repo: jest.Mocked<UsuarioRepository> = {
    buscarPorId: jest.fn().mockResolvedValue(usuario()),
    registrarCliente: jest.fn().mockResolvedValue(usuario()),
    listar: jest.fn(),
    registrarInterno: jest.fn(),
    cambiarRol: jest.fn(),
    cambiarEstado: jest.fn(),
  };
  const rolesGuard = {
    invalidar: jest.fn(),
  } as unknown as jest.Mocked<RolesGuard>;
  const sesiones = new SesionAutorizadaService(repo);
  return { identidad, repo, rolesGuard, sesiones };
}

describe('IniciarSesionUseCase', () => {
  it('devuelve tokens y el usuario con el rol de la tabla', async () => {
    const { identidad, repo, sesiones } = dobles();
    repo.buscarPorId.mockResolvedValue(usuario({ rol: 'ADMINISTRADOR' }));

    const r = await new IniciarSesionUseCase(identidad, sesiones).ejecutar(
      'ana@test.com',
      'x',
    );

    expect(r).toEqual({
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3600,
      user: {
        id: 'u1',
        email: 'ana@test.com',
        roles: ['ADMINISTRADOR'],
        nombreCompleto: 'Ana Pérez',
      },
    });
  });

  it('401 con credenciales inválidas (sin decir cuál campo falló)', async () => {
    const { identidad, sesiones } = dobles();
    identidad.iniciarSesion.mockRejectedValue(new CredencialesInvalidasError());
    await expect(
      new IniciarSesionUseCase(identidad, sesiones).ejecutar('a@b.com', 'mal'),
    ).rejects.toThrow(
      new UnauthorizedException('Email o contraseña incorrectos'),
    );
  });

  it('403 si la cuenta está bloqueada en Auth', async () => {
    const { identidad, sesiones } = dobles();
    identidad.iniciarSesion.mockRejectedValue(new CuentaBloqueadaError());
    await expect(
      new IniciarSesionUseCase(identidad, sesiones).ejecutar('a@b.com', 'x'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('403 si el perfil está desactivado aunque Auth acepte la contraseña', async () => {
    const { identidad, repo, sesiones } = dobles();
    repo.buscarPorId.mockResolvedValue(usuario({ activo: false }));
    await expect(
      new IniciarSesionUseCase(identidad, sesiones).ejecutar('a@b.com', 'x'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('403 si la cuenta de Auth no tiene perfil en svas.usuario', async () => {
    const { identidad, repo, sesiones } = dobles();
    repo.buscarPorId.mockResolvedValue(null);
    await expect(
      new IniciarSesionUseCase(identidad, sesiones).ejecutar('a@b.com', 'x'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('RefrescarSesionUseCase', () => {
  it('401 si el refresh token no sirve', async () => {
    const { identidad, sesiones } = dobles();
    identidad.refrescar.mockRejectedValue(new SesionInvalidaError());
    await expect(
      new RefrescarSesionUseCase(identidad, sesiones).ejecutar('rt'),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('RegistrarClienteUseCase', () => {
  const datos = {
    nombres: ' Ana ',
    apellidos: 'Pérez  Gómez',
    email: 'ana@test.com',
    password: 'secreta123',
    telefono: '987654321',
  };

  it('crea la cuenta, el perfil CLIENTE y luego inicia sesión', async () => {
    const { identidad, repo, sesiones } = dobles();
    const r = await new RegistrarClienteUseCase(
      identidad,
      repo,
      sesiones,
    ).ejecutar(datos);

    expect(identidad.crearCuenta).toHaveBeenCalledWith(
      'ana@test.com',
      'secreta123',
    );
    expect(repo.registrarCliente).toHaveBeenCalledWith({
      id: 'u1',
      email: 'ana@test.com',
      nombreCompleto: 'Ana Pérez Gómez',
    });
    // El login va DESPUÉS del perfil, para que el token ya traiga el rol.
    expect(identidad.iniciarSesion.mock.invocationCallOrder[0]).toBeGreaterThan(
      repo.registrarCliente.mock.invocationCallOrder[0],
    );
    expect(r.access_token).toBe('at');
  });

  it('409 si el email ya existe', async () => {
    const { identidad, repo, sesiones } = dobles();
    identidad.crearCuenta.mockRejectedValue(new EmailYaRegistradoError());
    await expect(
      new RegistrarClienteUseCase(identidad, repo, sesiones).ejecutar(datos),
    ).rejects.toThrow(ConflictException);
  });

  it('400 si Supabase considera débil la contraseña', async () => {
    const { identidad, repo, sesiones } = dobles();
    identidad.crearCuenta.mockRejectedValue(new ContrasenaDebilError());
    await expect(
      new RegistrarClienteUseCase(identidad, repo, sesiones).ejecutar(datos),
    ).rejects.toThrow(BadRequestException);
  });

  it('si falla el perfil, elimina la cuenta de Auth (compensación) y propaga el error', async () => {
    const { identidad, repo, sesiones } = dobles();
    repo.registrarCliente.mockRejectedValue(new Error('db caída'));
    await expect(
      new RegistrarClienteUseCase(identidad, repo, sesiones).ejecutar(datos),
    ).rejects.toThrow('db caída');
    expect(identidad.eliminarCuenta).toHaveBeenCalledWith('u1');
    expect(identidad.iniciarSesion).not.toHaveBeenCalled();
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

    const [, contrasena] = identidad.crearCuenta.mock.calls[0];
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
    const { repo, rolesGuard } = dobles();
    repo.cambiarRol.mockResolvedValue(
      usuario({ id: 'u2', rol: 'ADMINISTRADOR' }),
    );
    await new CambiarRolUsuarioUseCase(repo, rolesGuard).ejecutar(
      'tok',
      'u2',
      'ADMINISTRADOR',
    );
    expect(repo.cambiarRol).toHaveBeenCalledWith('tok', 'u2', 'ADMINISTRADOR');
    expect(rolesGuard.invalidar).toHaveBeenCalledWith('u2');
  });
});

describe('CambiarEstadoUsuarioUseCase', () => {
  it('al desactivar: RPC, invalida caché y bloquea en Auth', async () => {
    const { identidad, repo, rolesGuard } = dobles();
    repo.cambiarEstado.mockResolvedValue(usuario({ id: 'u2', activo: false }));
    await new CambiarEstadoUsuarioUseCase(repo, identidad, rolesGuard).ejecutar(
      'tok',
      'u2',
      false,
    );
    expect(rolesGuard.invalidar).toHaveBeenCalledWith('u2');
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
    const { identidad, repo, rolesGuard } = dobles();
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
    expect(rolesGuard.invalidar).not.toHaveBeenCalled();
  });
});
