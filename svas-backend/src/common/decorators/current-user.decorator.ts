import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type {
  RequestConContexto,
  UsuarioAutenticado,
} from '../types/usuario-autenticado';

/** Inyecta el usuario autenticado: `metodo(@CurrentUser() usuario: UsuarioAutenticado)`. */
export const CurrentUser = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): UsuarioAutenticado | undefined =>
    ctx.switchToHttp().getRequest<RequestConContexto>().usuario,
);
