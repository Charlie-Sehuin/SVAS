import { Injectable } from '@nestjs/common';
import type { ClasificadorPreocupaciones } from '../../modules/prueba-choque/domain/clasificador-preocupaciones.port';
import { noImplementado } from '../no-implementado';

/**
 * PENDIENTE (Ola 4, opcional): solo se usa con FEATURE_CLASIFICADOR_LLM=true.
 * Devuelve solo códigos de escenario y variables de perfil, validados con zod.
 */
@Injectable()
export class ClasificadorLlmAdapter implements ClasificadorPreocupaciones {
  clasificar(): ReturnType<ClasificadorPreocupaciones['clasificar']> {
    return noImplementado('ClasificadorLLM', 'Ola 4');
  }
}
