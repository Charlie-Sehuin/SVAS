import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { ErrorBaseDatos } from '../../../common/filters/postgrest-error.filter';
import { llamarRpc } from '../../../infrastructure/database/rpc.helper';
import { SupabaseUserClientFactory } from '../../../infrastructure/database/supabase-user-client.factory';
import type {
  CategoriaCobertura,
  TipoRequisito,
} from '../../planes/domain/contenido-plan';
import type {
  CoberturaAdminVista,
  CoberturaParaGuardar,
  CompletitudPlan,
  ContenidoAdminBase,
  ContenidoParaGuardar,
  Incoherencia,
} from '../domain/contenido-admin';
import type { ContenidoAdminRepository } from '../domain/contenido-admin.repository.port';

type Uno<T> = T | T[] | null;
const uno = <T>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function datos<T>(r: { data: unknown; error: { message: string } | null }): T {
  if (r.error) throw new ErrorBaseDatos(r.error);
  return r.data as T;
}

interface FilaCoberturaDb {
  id: string;
  codigo: string;
  nombre: string;
  categoria: CategoriaCobertura;
  descripcion: string;
  orden: number;
  activa: boolean;
  cobertura_escenario: { escenario_siniestro: Uno<{ codigo: string }> }[];
}

interface FilaIncoherenciaDb {
  codigo: string;
  nombre: string;
  incluida: boolean;
  escenarios_que_cubren: string[];
}

interface FilaCompletitudDb {
  plan_id: string;
  aseguradora: string;
  plan: string;
  activo: boolean;
  coberturas_faltantes: number;
  tiene_resumen: boolean;
  tiene_descripcion: boolean;
  tiene_ideal_para: boolean;
  n_requisitos: number;
  n_exclusiones: number;
  incoherencias_prueba_choque: number;
  completo: boolean;
  contenido_actualizado_en: string | null;
}

const aIncoherencia = (f: FilaIncoherenciaDb): Incoherencia => ({
  codigo: f.codigo,
  nombre: f.nombre,
  incluida: f.incluida,
  escenariosQueCubren: f.escenarios_que_cubren ?? [],
});

const aCobertura = (c: FilaCoberturaDb): CoberturaAdminVista => ({
  id: c.id,
  codigo: c.codigo,
  nombre: c.nombre,
  categoria: c.categoria,
  descripcion: c.descripcion,
  orden: c.orden,
  activa: c.activa,
  escenarios: c.cobertura_escenario
    .map((ce) => uno(ce.escenario_siniestro)?.codigo ?? '')
    .filter(Boolean)
    .sort(),
});

@Injectable()
export class ContenidoAdminSupabaseRepository implements ContenidoAdminRepository {
  constructor(private readonly clientes: SupabaseUserClientFactory) {}

  async obtener(
    token: string,
    planId: string,
  ): Promise<ContenidoAdminBase | null> {
    const db = this.db(token);
    const plan = datos<{
      id: string;
      nombre: string;
      activo: boolean;
      resumen: string | null;
      descripcion: string | null;
      ideal_para: string | null;
      contenido_actualizado_en: string | null;
      aseguradora: Uno<{ nombre: string }>;
    } | null>(
      await db
        .from('plan')
        .select(
          'id, nombre, activo, resumen, descripcion, ideal_para, contenido_actualizado_en, aseguradora(nombre)',
        )
        .eq('id', planId)
        .maybeSingle(),
    );
    if (!plan) return null;

    const [catalogo, filas, exclusiones, requisitos] = await Promise.all([
      db
        .from('cobertura')
        .select('id, codigo, nombre, categoria, orden')
        .eq('activa', true)
        .order('orden'),
      db
        .from('plan_cobertura')
        .select('cobertura_id, incluida, detalle, limite_monto')
        .eq('plan_id', planId),
      db
        .from('plan_exclusion')
        .select('texto')
        .eq('plan_id', planId)
        .eq('activa', true)
        .order('orden'),
      db
        .from('plan_requisito')
        .select('tipo, texto, obligatorio')
        .eq('plan_id', planId)
        .eq('activo', true)
        .order('orden'),
    ]);

    const porCobertura = new Map(
      datos<
        {
          cobertura_id: string;
          incluida: boolean;
          detalle: string | null;
          limite_monto: number | string | null;
        }[]
      >(filas).map((f) => [f.cobertura_id, f]),
    );

    return {
      planId: plan.id,
      aseguradora: uno(plan.aseguradora)?.nombre ?? '',
      plan: plan.nombre,
      activo: plan.activo,
      resumen: plan.resumen,
      descripcion: plan.descripcion,
      idealPara: plan.ideal_para,
      coberturas: datos<
        {
          id: string;
          codigo: string;
          nombre: string;
          categoria: CategoriaCobertura;
        }[]
      >(catalogo).map((c) => {
        const f = porCobertura.get(c.id);
        return {
          codigo: c.codigo,
          nombre: c.nombre,
          categoria: c.categoria,
          definida: !!f,
          incluida: f?.incluida ?? null,
          detalle: f?.detalle ?? null,
          limiteMonto:
            f?.limite_monto == null
              ? null
              : new Decimal(f.limite_monto).toFixed(2),
        };
      }),
      exclusiones: datos<{ texto: string }[]>(exclusiones).map((x) => x.texto),
      requisitos:
        datos<{ tipo: TipoRequisito; texto: string; obligatorio: boolean }[]>(
          requisitos,
        ),
      contenidoActualizadoEn: plan.contenido_actualizado_en,
    };
  }

  async incoherencias(token: string, planId: string) {
    const filas = await llamarRpc<FilaIncoherenciaDb[]>(
      this.db(token),
      'admin_incoherencias_plan',
      { p_plan_id: planId },
    );
    return (filas ?? []).map(aIncoherencia);
  }

  async completitud(token: string, planId?: string) {
    let q = this.db(token)
      .from('v_plan_contenido_completitud')
      .select('*')
      .order('aseguradora')
      .order('plan');
    if (planId) q = q.eq('plan_id', planId);
    return datos<FilaCompletitudDb[]>(await q).map((f): CompletitudPlan => ({
      planId: f.plan_id,
      aseguradora: f.aseguradora,
      plan: f.plan,
      activo: f.activo,
      coberturasFaltantes: f.coberturas_faltantes,
      tieneResumen: f.tiene_resumen,
      tieneDescripcion: f.tiene_descripcion,
      tieneIdealPara: f.tiene_ideal_para,
      nRequisitos: f.n_requisitos,
      nExclusiones: f.n_exclusiones,
      incoherenciasPruebaChoque: f.incoherencias_prueba_choque,
      completo: f.completo,
      contenidoActualizadoEn: f.contenido_actualizado_en,
    }));
  }

  async guardar(token: string, planId: string, c: ContenidoParaGuardar) {
    const r = await llamarRpc<{
      cambio: boolean;
      advertencias: FilaIncoherenciaDb[];
    }>(this.db(token), 'admin_guardar_plan_contenido', {
      p_plan_id: planId,
      p_payload: {
        resumen: c.resumen,
        descripcion: c.descripcion,
        ideal_para: c.idealPara,
        coberturas: c.coberturas.map((x) => ({
          codigo: x.codigo,
          incluida: x.incluida,
          detalle: x.detalle ?? null,
          limite_monto: x.limiteMonto ?? null,
        })),
        exclusiones: c.exclusiones,
        requisitos: c.requisitos.map((x) => ({
          tipo: x.tipo,
          texto: x.texto,
          obligatorio: x.obligatorio ?? true,
        })),
      },
    });
    return {
      cambio: r.cambio,
      advertencias: (r.advertencias ?? []).map(aIncoherencia),
    };
  }

  async listarCoberturas(token: string) {
    return datos<FilaCoberturaDb[]>(
      await this.db(token)
        .from('cobertura')
        .select(
          'id, codigo, nombre, categoria, descripcion, orden, activa, cobertura_escenario(escenario_siniestro(codigo))',
        )
        .order('orden')
        .order('codigo'),
    ).map(aCobertura);
  }

  async guardarCobertura(
    token: string,
    codigo: string,
    c: CoberturaParaGuardar,
  ) {
    const r = await llamarRpc<{
      id: string;
      codigo: string;
      nombre: string;
      categoria: CategoriaCobertura;
      descripcion: string;
      orden: number;
      activa: boolean;
      escenarios: string[];
      planes_sin_definir: number;
    }>(this.db(token), 'admin_guardar_cobertura_catalogo', {
      p_codigo: codigo,
      p_payload: {
        nombre: c.nombre,
        categoria: c.categoria,
        descripcion: c.descripcion,
        orden: c.orden,
        activa: c.activa,
        escenarios: c.escenarios,
      },
    });
    return {
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      categoria: r.categoria,
      descripcion: r.descripcion,
      orden: r.orden,
      activa: r.activa,
      escenarios: r.escenarios ?? [],
      planesSinDefinir: r.planes_sin_definir,
    };
  }

  private db(token: string) {
    return this.clientes.paraToken(token);
  }
}
