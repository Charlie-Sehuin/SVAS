import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  ArchivoTarjeta,
  LectorTarjeta,
  TarjetaCruda,
} from '../../modules/cotizacion/domain/lector-tarjeta.port';
import type { OpcionCatalogo } from '../../modules/cotizacion/domain/reconocedor-vehiculo.port';

/**
 * Lector simulado: se usa mientras no haya GEMINI_API_KEY. No mira el archivo:
 * devuelve el primer modelo del catálogo, año 2020 y placa ABC123. En
 * producción no responde datos inventados: avisa que no está disponible.
 */
@Injectable()
export class LectorTarjetaSimuladoAdapter implements LectorTarjeta {
  constructor(private readonly enProduccion: boolean) {}

  leer(
    _archivo: ArchivoTarjeta,
    catalogo: OpcionCatalogo[],
  ): Promise<TarjetaCruda> {
    if (this.enProduccion) {
      return Promise.reject(
        new ServiceUnavailableException(
          'La lectura de la tarjeta no está disponible por ahora',
        ),
      );
    }
    const opcion = catalogo.find((c) => c.modelos.length > 0);
    return Promise.resolve({
      placa: 'ABC123',
      marca: opcion?.marca ?? null,
      modelo: opcion?.modelos[0] ?? null,
      anio: 2020,
    });
  }
}
