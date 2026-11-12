import { Injectable } from '@nestjs/common';
import type { EmisionAseguradora } from '../../modules/polizas/domain/emision-aseguradora.port';
import { noImplementado } from '../no-implementado';

/** PENDIENTE (Ola 3): genera un número de póliza simulado por aseguradora. */
@Injectable()
export class AseguradoraSimuladaAdapter implements EmisionAseguradora {
  emitir(): ReturnType<EmisionAseguradora['emitir']> {
    return noImplementado('EmisionAseguradora simulada', 'Ola 3');
  }
}
