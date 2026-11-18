import type { OpcionCatalogo } from './reconocedor-vehiculo.port';

/** Tarjeta de identificación vehicular (foto o PDF) ya en memoria; nunca se guarda. */
export interface ArchivoTarjeta {
  datos: Buffer;
  mimeType: string;
}

/**
 * Lo que el lector cree ver en la tarjeta; aún no está validado contra el catálogo.
 * Solo estos cuatro datos: nombre, DNI, VIN, serie y motor nunca se piden.
 */
export interface TarjetaCruda {
  placa: string | null;
  marca: string | null;
  modelo: string | null;
  /** Año de modelo si aparece; si no, el de fabricación. */
  anio: number | null;
}

export interface LectorTarjeta {
  leer(
    archivo: ArchivoTarjeta,
    catalogo: OpcionCatalogo[],
  ): Promise<TarjetaCruda>;
}

export const LECTOR_TARJETA = Symbol('LECTOR_TARJETA');
