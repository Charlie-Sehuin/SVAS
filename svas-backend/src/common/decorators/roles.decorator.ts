import { SetMetadata } from '@nestjs/common';
import type { Rol } from '../types/usuario-autenticado';

export const ROLES_KEY = 'roles';

/** @Roles('ASESOR', 'ADMINISTRADOR'): el usuario debe tener alguno de estos roles. */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);
