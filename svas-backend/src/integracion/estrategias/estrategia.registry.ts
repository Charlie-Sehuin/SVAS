import type {
  CodigoEstrategia,
  EstrategiaCotizacion,
  RegistroEstrategias,
} from '../../modules/cotizacion/domain/estrategia-cotizacion.port';
import { EstrategiaLaPositiva } from './estrategia-la-positiva';
import { EstrategiaMapfre } from './estrategia-mapfre';
import { EstrategiaPacifico } from './estrategia-pacifico';
import { EstrategiaQualitas } from './estrategia-qualitas';
import { EstrategiaRimac } from './estrategia-rimac';

/**
 * Map<codigo_estrategia, EstrategiaCotizacion>. Agregar una aseguradora =
 * una clase nueva + una línea aquí (principio abierto/cerrado, doc contexto §17.11).
 */
export class EstrategiaRegistry implements RegistroEstrategias {
  private readonly porCodigo: Map<CodigoEstrategia, EstrategiaCotizacion>;

  constructor(
    estrategias: readonly EstrategiaCotizacion[] = [
      new EstrategiaRimac(),
      new EstrategiaPacifico(),
      new EstrategiaLaPositiva(),
      new EstrategiaMapfre(),
      new EstrategiaQualitas(),
    ],
  ) {
    this.porCodigo = new Map(estrategias.map((e) => [e.codigo, e]));
  }

  obtener(codigo: string): EstrategiaCotizacion {
    const estrategia = this.porCodigo.get(codigo as CodigoEstrategia);
    if (!estrategia) {
      // Error de configuración (aseguradora.codigo_estrategia sin clase): 500, no culpa del usuario.
      throw new Error(
        `No existe estrategia de cotización para el código "${codigo}"`,
      );
    }
    return estrategia;
  }

  todas(): readonly EstrategiaCotizacion[] {
    return [...this.porCodigo.values()];
  }
}
