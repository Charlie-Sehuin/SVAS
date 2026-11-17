/** Foto del vehículo ya en memoria (nunca se guarda). */
export interface ImagenVehiculo {
  datos: Buffer;
  mimeType: string;
}

/** Marca con sus modelos activos: las únicas opciones que el reconocedor puede elegir. */
export interface OpcionCatalogo {
  marca: string;
  modelos: string[];
}

/** Lo que el reconocedor cree ver; aún no está validado contra el catálogo. */
export interface ReconocimientoCrudo {
  marca: string | null;
  modelo: string | null;
  /** Rango de años de la generación del auto (una foto rara vez da el año exacto). */
  anioDesde: number | null;
  anioHasta: number | null;
  /** 0 a 1. */
  confianza: number;
}

export interface ReconocedorVehiculo {
  reconocer(
    imagen: ImagenVehiculo,
    catalogo: OpcionCatalogo[],
  ): Promise<ReconocimientoCrudo>;
}

export const RECONOCEDOR_VEHICULO = Symbol('RECONOCEDOR_VEHICULO');
