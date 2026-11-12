import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { ErrorBaseDatos } from '../../../common/filters/postgrest-error.filter';
import {
  SUPABASE_SERVICE_CLIENT,
  type SupabaseServiceClient,
} from '../../../infrastructure/database/supabase-service-client.provider';
import type { TarifaRepository } from '../domain/tarifa.repository.port';
import type { TarifaAseguradora } from '../domain/tarifa.types';

const TTL_MS = 5 * 60_000;
const PAGINA = 1000; // tope de filas por respuesta de PostgREST

type Num = number | string;

/**
 * Lee las tablas de tarifa con service_role: son secreto comercial (RLS solo
 * ADMINISTRADOR) y el cotizador es público. Nada de esto sale en un DTO.
 */
@Injectable()
export class TarifaSupabaseRepository implements TarifaRepository {
  private readonly cache = new Map<
    string,
    { tarifa: TarifaAseguradora; vence: number }
  >();

  constructor(
    @Inject(SUPABASE_SERVICE_CLIENT)
    private readonly db: SupabaseServiceClient,
  ) {}

  async cargar(aseguradoraId: string): Promise<TarifaAseguradora> {
    const enCache = this.cache.get(aseguradoraId);
    if (enCache && enCache.vence > Date.now()) return enCache.tarifa;

    const [planes, rangos, marca, modelo, anio, tipo, ubigeo] =
      await Promise.all([
        this.planes(aseguradoraId),
        this.todas<{
          modelo_id: string;
          anio: number;
          suma_minima: Num;
          suma_maxima: Num;
        }>(
          'rango_suma_asegurada',
          'modelo_id, anio, suma_minima, suma_maxima',
          aseguradoraId,
          ['modelo_id', 'anio'],
        ),
        this.todas<{ marca_id: string; peso: Num }>(
          'peso_marca',
          'marca_id, peso',
          aseguradoraId,
        ),
        this.todas<{ modelo_id: string; peso: Num }>(
          'peso_modelo',
          'modelo_id, peso',
          aseguradoraId,
        ),
        this.todas<{ anio: number; peso: Num }>(
          'peso_anio',
          'anio, peso',
          aseguradoraId,
        ),
        this.todas<{ tipo_id: string; peso: Num }>(
          'peso_tipo',
          'tipo_id, peso',
          aseguradoraId,
        ),
        this.todas<{ ubigeo: string; peso: Num }>(
          'peso_ubigeo',
          'ubigeo, peso',
          aseguradoraId,
        ),
      ]);

    const tarifa: TarifaAseguradora = {
      aseguradoraId,
      planes,
      rangos: new Map(
        rangos.map((r) => [
          `${r.modelo_id}:${r.anio}`,
          {
            minima: new Decimal(r.suma_minima),
            maxima: new Decimal(r.suma_maxima),
          },
        ]),
      ),
      pesoMarca: new Map(marca.map((p) => [p.marca_id, new Decimal(p.peso)])),
      pesoModelo: new Map(
        modelo.map((p) => [p.modelo_id, new Decimal(p.peso)]),
      ),
      pesoAnio: new Map(anio.map((p) => [p.anio, new Decimal(p.peso)])),
      pesoTipo: new Map(tipo.map((p) => [p.tipo_id, new Decimal(p.peso)])),
      pesoUbigeo: new Map(ubigeo.map((p) => [p.ubigeo, new Decimal(p.peso)])),
    };
    this.cache.set(aseguradoraId, { tarifa, vence: Date.now() + TTL_MS });
    return tarifa;
  }

  invalidar(aseguradoraId?: string): void {
    if (aseguradoraId) this.cache.delete(aseguradoraId);
    else this.cache.clear();
  }

  private async planes(aseguradoraId: string) {
    const { data, error } = await this.db
      .from('plan')
      .select('id, nombre, tarifa_plan!inner(tasa_base, parametros)')
      .eq('aseguradora_id', aseguradoraId)
      .eq('activo', true)
      .order('nombre');
    if (error) throw new ErrorBaseDatos(error);
    type Fila = {
      id: string;
      nombre: string;
      tarifa_plan:
        | { tasa_base: Num; parametros: Record<string, unknown> }
        | { tasa_base: Num; parametros: Record<string, unknown> }[];
    };
    return (data as unknown as Fila[]).map((p) => {
      const t = Array.isArray(p.tarifa_plan) ? p.tarifa_plan[0] : p.tarifa_plan;
      return {
        planId: p.id,
        nombre: p.nombre,
        tasaBase: new Decimal(t.tasa_base),
        parametros: t.parametros,
      };
    });
  }

  /** Todas las filas de la aseguradora, paginando de 1000 en 1000. */
  private async todas<T>(
    tabla: string,
    columnas: string,
    aseguradoraId: string,
    orden: string[] = [columnas.split(',')[0].trim()], // la clave: orden estable entre páginas
  ): Promise<T[]> {
    const filas: T[] = [];
    for (let desde = 0; ; desde += PAGINA) {
      let q = this.db
        .from(tabla)
        .select(columnas)
        .eq('aseguradora_id', aseguradoraId);
      for (const col of orden) q = q.order(col);
      const { data, error } = await q.range(desde, desde + PAGINA - 1);
      if (error) throw new ErrorBaseDatos(error);
      filas.push(...(data as unknown as T[]));
      if (data.length < PAGINA) return filas;
    }
  }
}
