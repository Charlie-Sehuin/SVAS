import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { EmisionAseguradora } from '../../modules/polizas/domain/emision-aseguradora.port';

/** Prefijo del número de póliza de demostración por aseguradora. */
export const PREFIJO_POLIZA: Record<string, string> = {
  RIMAC: 'RIM',
  PACIFICO: 'PAC',
  LA_POSITIVA: 'LPV',
  MAPFRE: 'MAP',
  QUALITAS: 'QUA',
};

/**
 * Emisión de demostración: no llama a ninguna aseguradora. El número es
 * PREFIJO-AÑO-8 hex del hash de la orden, p. ej. RIM-2026-4F3A9C21, así que
 * repetir la emisión de la misma orden da el mismo número (idempotente).
 */
@Injectable()
export class AseguradoraSimuladaAdapter implements EmisionAseguradora {
  /** Reloj (en los tests se reemplaza). */
  ahora(): Date {
    return new Date();
  }

  emitir(
    i: Parameters<EmisionAseguradora['emitir']>[0],
  ): ReturnType<EmisionAseguradora['emitir']> {
    const prefijo = PREFIJO_POLIZA[i.codigoEstrategia];
    if (!prefijo) {
      return Promise.reject(
        new Error(`Aseguradora sin emisión configurada: ${i.codigoEstrategia}`),
      );
    }
    const anio = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
    }).format(this.ahora());
    const huella = createHash('sha256')
      .update(i.ordenId)
      .digest('hex')
      .slice(0, 8)
      .toUpperCase();
    return Promise.resolve({ numeroPoliza: `${prefijo}-${anio}-${huella}` });
  }
}
