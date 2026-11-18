import { Injectable, Logger } from '@nestjs/common';
import type {
  ArchivoTarjeta,
  LectorTarjeta,
  TarjetaCruda,
} from '../../modules/cotizacion/domain/lector-tarjeta.port';
import type { OpcionCatalogo } from '../../modules/cotizacion/domain/reconocedor-vehiculo.port';

/**
 * Principal (DeepSeek) con respaldo (Gemini): si el principal falla por lo que sea (saldo agotado, red,
 * respuesta vacía, o un PDF que no sabe leer), se intenta una vez con el respaldo. Si el respaldo también
 * falla, se devuelve su error, que es el último intento.
 */
@Injectable()
export class LectorTarjetaConRespaldoAdapter implements LectorTarjeta {
  private readonly logger = new Logger('LectorTarjetaConRespaldo');

  constructor(
    private readonly principal: LectorTarjeta,
    private readonly respaldo: LectorTarjeta,
  ) {}

  async leer(
    archivo: ArchivoTarjeta,
    catalogo: OpcionCatalogo[],
  ): Promise<TarjetaCruda> {
    try {
      return await this.principal.leer(archivo, catalogo);
    } catch {
      // El detalle del fallo ya lo registró el adaptador principal.
      this.logger.warn('El lector principal falló: se intenta con el respaldo');
      return this.respaldo.leer(archivo, catalogo);
    }
  }
}
