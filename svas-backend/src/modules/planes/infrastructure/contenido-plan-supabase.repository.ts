import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { ErrorBaseDatos } from '../../../common/filters/postgrest-error.filter';
import {
  SUPABASE_SERVICE_CLIENT,
  type SupabaseServiceClient,
} from '../../../infrastructure/database/supabase-service-client.provider';
import type {
  CategoriaCobertura,
  CoberturaCatalogo,
  ContenidoPlan,
  TipoRequisito,
} from '../domain/contenido-plan';
import type {
  ContenidoPlanRepository,
  ContenidoPublicado,
  ResumenPlanes,
} from '../domain/contenido-plan.repository.port';

const TTL_MS = 5 * 60_000;

type Uno<T> = T | T[] | null;
const uno = <T>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function datos<T>(r: { data: unknown; error: { message: string } | null }): T {
  if (r.error) throw new ErrorBaseDatos(r.error);
  return r.data as T;
}

interface FilaPlan {
  id: string;
  nombre: string;
  resumen: string | null;
  descripcion: string | null;
  ideal_para: string | null;
  orden: number;
  contenido_actualizado_en: string | null;
  aseguradora: Uno<{ nombre: string }>;
}

interface FilaCobertura {
  id: string;
  codigo: string;
  nombre: string;
  categoria: CategoriaCobertura;
  orden: number;
}

/**
 * Contenido publicado (service_role, solo lectura). Las tablas son chicas
 * (10 planes × 13 coberturas): se carga todo de una vez y se guarda 5 min.
 */
@Injectable()
export class ContenidoPlanSupabaseRepository
  implements ContenidoPlanRepository, ResumenPlanes
{
  private cache: { valor: ContenidoPublicado; vence: number } | null = null;

  constructor(
    @Inject(SUPABASE_SERVICE_CLIENT)
    private readonly servicio: SupabaseServiceClient,
  ) {}

  invalidar(): void {
    this.cache = null;
  }

  async resumenes(planIds: string[]) {
    const { planes } = await this.publicado();
    return new Map(planIds.map((id) => [id, planes.get(id)?.resumen ?? null]));
  }

  async publicado(): Promise<ContenidoPublicado> {
    if (this.cache && this.cache.vence > Date.now()) return this.cache.valor;

    const [planes, coberturas, filas, exclusiones, requisitos] =
      await Promise.all([
        this.servicio
          .from('plan')
          .select(
            'id, nombre, resumen, descripcion, ideal_para, orden, contenido_actualizado_en, aseguradora!inner(nombre)',
          )
          .eq('activo', true)
          .eq('aseguradora.activa', true),
        this.servicio
          .from('cobertura')
          .select('id, codigo, nombre, categoria, orden')
          .eq('activa', true)
          .order('orden'),
        this.servicio
          .from('plan_cobertura')
          .select('plan_id, cobertura_id, incluida, detalle, limite_monto'),
        this.servicio
          .from('plan_exclusion')
          .select('plan_id, texto, orden')
          .eq('activa', true)
          .order('orden'),
        this.servicio
          .from('plan_requisito')
          .select('plan_id, tipo, texto, obligatorio, orden')
          .eq('activo', true)
          .order('orden'),
      ]);

    const catalogoFilas = datos<FilaCobertura[]>(coberturas);
    const porId = new Map(catalogoFilas.map((c) => [c.id, c]));
    const contenido = new Map<string, ContenidoPlan>(
      datos<FilaPlan[]>(planes).map((p) => [
        p.id,
        {
          planId: p.id,
          aseguradora: uno(p.aseguradora)?.nombre ?? '',
          plan: p.nombre,
          resumen: p.resumen,
          descripcion: p.descripcion,
          idealPara: p.ideal_para,
          coberturas: [],
          exclusiones: [],
          requisitos: [],
          actualizadoEn: p.contenido_actualizado_en,
        },
      ]),
    );

    for (const f of datos<
      {
        plan_id: string;
        cobertura_id: string;
        incluida: boolean;
        detalle: string | null;
        limite_monto: number | string | null;
      }[]
    >(filas)) {
      const plan = contenido.get(f.plan_id);
      const cob = porId.get(f.cobertura_id);
      if (!plan || !cob) continue; // plan inactivo o cobertura inactiva
      plan.coberturas.push({
        codigo: cob.codigo,
        nombre: cob.nombre,
        categoria: cob.categoria,
        incluida: f.incluida,
        detalle: f.detalle,
        limiteMonto:
          f.limite_monto === null
            ? null
            : new Decimal(f.limite_monto).toFixed(2),
        orden: cob.orden,
      });
    }
    for (const p of contenido.values()) {
      p.coberturas.sort(
        (a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo),
      );
    }

    for (const x of datos<{ plan_id: string; texto: string }[]>(exclusiones)) {
      contenido.get(x.plan_id)?.exclusiones.push(x.texto);
    }
    for (const r of datos<
      {
        plan_id: string;
        tipo: TipoRequisito;
        texto: string;
        obligatorio: boolean;
      }[]
    >(requisitos)) {
      contenido.get(r.plan_id)?.requisitos.push({
        tipo: r.tipo,
        texto: r.texto,
        obligatorio: r.obligatorio,
      });
    }

    const catalogo: CoberturaCatalogo[] = catalogoFilas.map((c) => ({
      codigo: c.codigo,
      nombre: c.nombre,
      categoria: c.categoria,
      orden: c.orden,
    }));
    const valor = { planes: contenido, catalogo };
    this.cache = { valor, vence: Date.now() + TTL_MS };
    return valor;
  }
}
