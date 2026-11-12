import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { resolverError } from './http-exception.filter';
import {
  ErrorBaseDatos,
  MENSAJE_ERROR_INTERNO,
} from './postgrest-error.filter';

describe('resolverError', () => {
  it('HttpException con mensaje string', () => {
    expect(resolverError(new NotFoundException('No existe'))).toEqual({
      statusCode: 404,
      message: 'No existe',
      errors: undefined,
    });
  });

  it('error de validación con errors[] por campo', () => {
    const ex = new BadRequestException({
      message: 'Es obligatorio para Pacífico',
      errors: [{ campo: 'distrito', mensaje: 'Es obligatorio para Pacífico' }],
    });
    expect(resolverError(ex)).toEqual({
      statusCode: 400,
      message: 'Es obligatorio para Pacífico',
      errors: [{ campo: 'distrito', mensaje: 'Es obligatorio para Pacífico' }],
    });
  });

  it('500 nunca expone el mensaje interno', () => {
    expect(
      resolverError(
        new InternalServerErrorException('select * from svas.x falló'),
      ),
    ).toEqual({
      statusCode: 500,
      message: MENSAJE_ERROR_INTERNO,
    });
  });

  it('error desconocido → 500 genérico', () => {
    expect(resolverError(new TypeError('x is undefined'))).toEqual({
      statusCode: 500,
      message: MENSAJE_ERROR_INTERNO,
    });
  });

  it('403 conserva el mensaje del guard', () => {
    expect(
      resolverError(new ForbiddenException('Tu usuario está desactivado'))
        .message,
    ).toBe('Tu usuario está desactivado');
  });

  describe('errores de Postgres', () => {
    const pg = (
      code: string,
      message = 'msg interno con tabla svas.cotizacion',
    ) => resolverError(new ErrorBaseDatos({ code, message }));

    it('P0001 (RAISE del RPC) → 400 con el mensaje del RPC', () => {
      expect(pg('P0001', 'La suma asegurada está fuera del rango')).toEqual({
        statusCode: 400,
        message: 'La suma asegurada está fuera del rango',
      });
    });

    it('P0002 (RAISE "no existe" del RPC) → 404 con el mensaje del RPC', () => {
      expect(pg('P0002', 'El usuario no existe')).toEqual({
        statusCode: 404,
        message: 'El usuario no existe',
      });
    });

    it.each([
      ['42501', 403],
      ['23505', 409],
      ['23503', 400],
      ['23514', 400],
      ['22P02', 400],
      ['PGRST116', 404],
      ['XX000', 500],
    ])('%s → %i sin filtrar nombres de tabla', (code, status) => {
      const r = pg(code);
      expect(r.statusCode).toBe(status);
      expect(r.message).not.toContain('svas.');
    });
  });
});
