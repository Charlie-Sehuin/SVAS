import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { RequestConContexto } from '../types/usuario-autenticado';

/**
 * JWT verificado de la request, para crear el cliente de usuario de Supabase
 * (RLS y auth.uid() aplican). Solo en rutas autenticadas.
 */
export const AccessToken = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): string => {
    const token = ctx
      .switchToHttp()
      .getRequest<RequestConContexto>().accessToken;
    if (!token) throw new UnauthorizedException('Debes iniciar sesión');
    return token;
  },
);
