import { Injectable } from '@nestjs/common';
import type { ClasificadorPreocupaciones } from '../../modules/prueba-choque/domain/clasificador-preocupaciones.port';
import { noImplementado } from '../no-implementado';

/** PENDIENTE (Ola 4): adaptador por defecto, sin costo (doc contexto §16.6). */
@Injectable()
export class ClasificadorPalabrasClaveAdapter implements ClasificadorPreocupaciones {
  clasificar(): ReturnType<ClasificadorPreocupaciones['clasificar']> {
    return noImplementado('ClasificadorPorPalabrasClave', 'Ola 4');
  }
}
