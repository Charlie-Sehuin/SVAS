import type { AgruparVentas, Periodo } from './reportes';

/** JSON ya armado por las RPC de 0036 (camelCase, montos como string). */
export type Reporte = Record<string, unknown>;

/** Cada lectura va con el JWT de quien pide: la RPC exige el rol. */
export interface ReportesRepository {
  ventas(token: string, p: Periodo, agrupar: AgruparVentas): Promise<Reporte>;
  retencion(token: string, p: Periodo): Promise<Reporte>;
  descuentos(token: string, p: Periodo): Promise<Reporte>;
  pruebaChoque(token: string, p: Periodo): Promise<Reporte>;
  miDesempeno(token: string, p: Periodo): Promise<Reporte>;
}

export const REPORTES_REPOSITORY = Symbol('REPORTES_REPOSITORY');
