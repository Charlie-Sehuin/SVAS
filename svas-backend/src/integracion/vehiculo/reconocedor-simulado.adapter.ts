import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  OpcionCatalogo,
  ReconocedorVehiculo,
  ReconocimientoCrudo,
} from '../../modules/cotizacion/domain/reconocedor-vehiculo.port';

/**
 * Reconocedor simulado: se usa mientras no haya GEMINI_API_KEY. No mira la
 * foto: devuelve el primer modelo del catálogo para poder probar el flujo.
 * En producción no responde datos inventados: avisa que el servicio no está
 * disponible.
 */
@Injectable()
export class ReconocedorSimuladoAdapter implements ReconocedorVehiculo {
  constructor(private readonly enProduccion: boolean) {}

  reconocer(
    _imagen: Parameters<ReconocedorVehiculo['reconocer']>[0],
    catalogo: OpcionCatalogo[],
  ): Promise<ReconocimientoCrudo> {
    if (this.enProduccion) {
      return Promise.reject(
        new ServiceUnavailableException(
          'El reconocimiento por foto no está disponible por ahora',
        ),
      );
    }
    const opcion = catalogo.find((c) => c.modelos.length > 0);
    return Promise.resolve({
      marca: opcion?.marca ?? null,
      modelo: opcion?.modelos[0] ?? null,
      anioDesde: 2020,
      anioHasta: 2022,
      confianza: 0.5,
    });
  }
}
