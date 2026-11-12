import {
  type ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SupabaseServiceClient } from '../../infrastructure/database/supabase-service-client.provider';
import { Roles } from '../decorators/roles.decorator';
import type { Rol, UsuarioAutenticado } from '../types/usuario-autenticado';
import { RolesGuard } from './roles.guard';

class Rutas {
  libre() {}
  @Roles('ADMINISTRADOR')
  soloAdmin() {}
}

function contexto(metodo: 'libre' | 'soloAdmin', usuario: UsuarioAutenticado) {
  return {
    getHandler: () => Rutas.prototype[metodo],
    getClass: () => Rutas,
    switchToHttp: () => ({ getRequest: () => ({ usuario }) }),
  } as unknown as ExecutionContext;
}

function dbFalsa(respuesta: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(respuesta);
  const db = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  } as unknown as SupabaseServiceClient;
  return { db, maybeSingle };
}

const usuario = (roles: Rol[]): UsuarioAutenticado => ({
  id: 'u1',
  email: null,
  roles,
});

describe('RolesGuard', () => {
  it('ruta sin @Roles: pasa si el usuario está activo', async () => {
    const { db } = dbFalsa({
      data: { rol: 'CLIENTE', activo: true },
      error: null,
    });
    const guard = new RolesGuard(new Reflector(), db);
    await expect(
      guard.canActivate(contexto('libre', usuario(['CLIENTE']))),
    ).resolves.toBe(true);
  });

  it('403 si el usuario está desactivado aunque el JWT siga vigente', async () => {
    const { db } = dbFalsa({
      data: { rol: 'ADMINISTRADOR', activo: false },
      error: null,
    });
    const guard = new RolesGuard(new Reflector(), db);
    await expect(
      guard.canActivate(contexto('libre', usuario(['ADMINISTRADOR']))),
    ).rejects.toThrow(ForbiddenException);
  });

  it('403 si no existe fila en svas.usuario', async () => {
    const { db } = dbFalsa({ data: null, error: null });
    const guard = new RolesGuard(new Reflector(), db);
    await expect(
      guard.canActivate(contexto('libre', usuario(['CLIENTE']))),
    ).rejects.toThrow(ForbiddenException);
  });

  it('403 rápido (sin consultar la base) si el JWT no trae el rol requerido', async () => {
    const { db, maybeSingle } = dbFalsa({
      data: { rol: 'ADMINISTRADOR', activo: true },
      error: null,
    });
    const guard = new RolesGuard(new Reflector(), db);
    await expect(
      guard.canActivate(contexto('soloAdmin', usuario(['CLIENTE']))),
    ).rejects.toThrow(ForbiddenException);
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it('403 si el JWT dice ADMINISTRADOR pero la tabla ya no (rol degradado)', async () => {
    const { db } = dbFalsa({
      data: { rol: 'CLIENTE', activo: true },
      error: null,
    });
    const guard = new RolesGuard(new Reflector(), db);
    await expect(
      guard.canActivate(contexto('soloAdmin', usuario(['ADMINISTRADOR']))),
    ).rejects.toThrow(ForbiddenException);
  });

  it('pasa si JWT y tabla coinciden en el rol requerido', async () => {
    const { db } = dbFalsa({
      data: { rol: 'ADMINISTRADOR', activo: true },
      error: null,
    });
    const guard = new RolesGuard(new Reflector(), db);
    await expect(
      guard.canActivate(contexto('soloAdmin', usuario(['ADMINISTRADOR']))),
    ).resolves.toBe(true);
  });

  it('usa cache: una sola consulta para dos requests seguidas', async () => {
    const { db, maybeSingle } = dbFalsa({
      data: { rol: 'CLIENTE', activo: true },
      error: null,
    });
    const guard = new RolesGuard(new Reflector(), db);
    await guard.canActivate(contexto('libre', usuario(['CLIENTE'])));
    await guard.canActivate(contexto('libre', usuario(['CLIENTE'])));
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('503 si la base falla (y no lo cachea)', async () => {
    const { db, maybeSingle } = dbFalsa({
      data: null,
      error: { message: 'timeout' },
    });
    const guard = new RolesGuard(new Reflector(), db);
    await expect(
      guard.canActivate(contexto('libre', usuario(['CLIENTE']))),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      guard.canActivate(contexto('libre', usuario(['CLIENTE']))),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });
});
