import type { CampoAseguradora } from './formulario-dinamico';
import type { VehiculoCotizable } from './tarifa.types';

export interface AseguradoraActiva {
  id: string;
  nombre: string;
  codigoEstrategia: string;
}

/** Catálogo que ve cualquiera que cotiza (sin cuenta): solo filas activas. */
export interface CatalogoPublicoRepository {
  aseguradorasActivas(): Promise<AseguradoraActiva[]>;
  camposActivos(): Promise<CampoAseguradora[]>;
  marcas(): Promise<{ id: string; nombre: string }[]>;
  modelos(
    marcaId: string,
  ): Promise<{ id: string; nombre: string; tipo: string }[]>;
  /** Años con rango en al menos una aseguradora activa, del más nuevo al más viejo. */
  anios(modeloId: string): Promise<number[]>;
  departamentos(): Promise<string[]>;
  provincias(departamento: string): Promise<string[]>;
  distritos(
    departamento: string,
    provincia: string,
  ): Promise<{ ubigeo: string; distrito: string }[]>;
  /** modeloId → marca y tipo; null si el modelo o el ubigeo no existen (o están inactivos). */
  resolverVehiculo(
    modeloId: string,
    anio: number,
    ubigeo: string,
  ): Promise<
    (VehiculoCotizable & { marca: string; modelo: string; tipo: string }) | null
  >;
}

export const CATALOGO_PUBLICO_REPOSITORY = Symbol(
  'CATALOGO_PUBLICO_REPOSITORY',
);
