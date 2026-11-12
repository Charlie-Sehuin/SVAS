import type { PesoNombre } from '../../cotizacion/domain/tarifa.types';

/** Tarifas que edita el administrador (contexto §4.1 D7, §17). Montos y pesos como string decimal. */
export const TABLAS_PESO = [
  'marca',
  'modelo',
  'anio',
  'tipo',
  'ubigeo',
] as const satisfies readonly PesoNombre[];
export type TablaPeso = (typeof TABLAS_PESO)[number];

export interface TarifaPlanVista {
  planId: string;
  plan: string;
  aseguradoraId: string;
  tasaBase: string | null; // null = el plan aún no tiene tarifa (no cotiza)
  parametros: Record<string, unknown> | null;
  actualizadoEn: string | null;
}

export interface PesoVista {
  clave: string;
  nombre: string;
  peso: string;
}

export interface FilaPeso {
  clave: string;
  peso: number;
}

export interface RangoVista {
  modeloId: string;
  marca: string;
  modelo: string;
  anio: number;
  sumaMinima: string;
  sumaMaxima: string;
}

export interface FilaRango {
  modeloId: string;
  anio: number;
  sumaMinima: number;
  sumaMaxima: number;
}

export interface ResumenCarga {
  recibidas: number;
  cambiadas: number;
  total: number;
}

export interface FaltanteTarifa {
  aseguradoraId: string;
  codigoEstrategia: string;
  modeloId: string;
  marca: string;
  modelo: string;
  anio: number;
  sinRango: boolean;
  pesosFaltantes: PesoNombre[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Formato de la clave según la tabla de pesos: uuid, año de 4 dígitos o ubigeo INEI. */
export function claveValida(tabla: TablaPeso, clave: string): boolean {
  switch (tabla) {
    case 'anio':
      return /^\d{4}$/.test(clave) && +clave >= 1950 && +clave <= 2100;
    case 'ubigeo':
      return /^\d{6}$/.test(clave);
    default:
      return UUID.test(clave);
  }
}
