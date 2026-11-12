import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { ErrorBaseDatos } from '../../../common/filters/postgrest-error.filter';
import { llamarRpc } from '../../../infrastructure/database/rpc.helper';
import { SupabaseUserClientFactory } from '../../../infrastructure/database/supabase-user-client.factory';
import type {
  CondicionTaller,
  UsoVehiculo,
  VariablePerfil,
  ZonaRiesgo,
} from '../../../shared/types/enums';
import type {
  CoberturaVista,
  EscenarioAdminVista,
  EscenarioParaGuardar,
  FactorVista,
  FilaCobertura,
  FilaFactor,
  FilaFrecuencia,
  FilaZona,
  FrecuenciaVista,
  PlanActivo,
  ResumenCargaChoque,
  ZonaVista,
} from '../domain/prueba-choque-admin';
import type { PruebaChoqueAdminRepository } from '../domain/prueba-choque-admin.repository.port';

type Num = number | string;
/** PostgREST devuelve una relación a-uno como objeto, pero el tipo puede venir como arreglo. */
type Uno<T> = T | T[] | null;
const uno = <T>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const fijo = (v: Num | null, n: number) =>
  v === null ? null : new Decimal(v).toFixed(n);

function datos<T>(r: { data: unknown; error: { message: string } | null }): T {
  if (r.error) throw new ErrorBaseDatos(r.error);
  return r.data as T;
}

interface FilaEscenarioDb {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  monto_dano_referencial: Num | null;
  dias_taller_estimados: number;
  orden: number;
  activo: boolean;
}

interface FilaCoberturaDb {
  plan_id: string;
  cubre: boolean;
  deducible_pct: Num | null;
  deducible_minimo: Num | null;
  tope_cobertura: Num | null;
  condicion_taller: CondicionTaller;
  dias_auto_reemplazo: number;
  fuente: string;
  actualizado_en: string;
  escenario_siniestro: Uno<{ codigo: string; orden: number }>;
  plan: Uno<{ nombre: string; aseguradora: Uno<{ nombre: string }> }>;
}

const aEscenario = (f: FilaEscenarioDb): EscenarioAdminVista => ({
  id: f.id,
  codigo: f.codigo,
  nombre: f.nombre,
  descripcion: f.descripcion,
  montoDanoReferencial: fijo(f.monto_dano_referencial, 2),
  diasTaller: f.dias_taller_estimados,
  orden: f.orden,
  activo: f.activo,
});

const COLUMNAS_ESCENARIO =
  'id, codigo, nombre, descripcion, monto_dano_referencial, dias_taller_estimados, orden, activo';

@Injectable()
export class PruebaChoqueAdminSupabaseRepository implements PruebaChoqueAdminRepository {
  constructor(private readonly clientes: SupabaseUserClientFactory) {}

  // ── Escenarios ────────────────────────────────────────────────────────────
  async listarEscenarios(token: string) {
    return datos<FilaEscenarioDb[]>(
      await this.db(token)
        .from('escenario_siniestro')
        .select(COLUMNAS_ESCENARIO)
        .order('orden')
        .order('codigo'),
    ).map(aEscenario);
  }

  async guardarEscenario(
    token: string,
    codigo: string,
    e: EscenarioParaGuardar,
  ) {
    const fila = await llamarRpc<FilaEscenarioDb>(
      this.db(token),
      'admin_guardar_escenario',
      {
        p_codigo: codigo,
        p_payload: {
          nombre: e.nombre,
          descripcion: e.descripcion,
          monto_dano_referencial: e.montoDanoReferencial,
          dias_taller_estimados: e.diasTaller,
          orden: e.orden,
          activo: e.activo,
        },
      },
    );
    return aEscenario(fila);
  }

  // ── Coberturas ────────────────────────────────────────────────────────────
  async listarCoberturas(
    token: string,
    f: { planId?: string; escenario?: string },
  ): Promise<CoberturaVista[]> {
    let q = this.db(token)
      .from('cobertura_plan_escenario')
      .select(
        `plan_id, cubre, deducible_pct, deducible_minimo, tope_cobertura, condicion_taller,
         dias_auto_reemplazo, fuente, actualizado_en,
         escenario_siniestro!inner(codigo, orden), plan!inner(nombre, aseguradora(nombre))`,
      );
    if (f.planId) q = q.eq('plan_id', f.planId);
    if (f.escenario) q = q.eq('escenario_siniestro.codigo', f.escenario);
    const filas = datos<FilaCoberturaDb[]>(await q);
    return filas
      .map((c) => {
        const plan = uno(c.plan);
        const esc = uno(c.escenario_siniestro);
        return {
          orden: esc?.orden ?? 0,
          vista: {
            planId: c.plan_id,
            plan: plan?.nombre ?? '',
            aseguradora: uno(plan?.aseguradora ?? null)?.nombre ?? '',
            escenario: esc?.codigo ?? '',
            cubre: c.cubre,
            deduciblePct: fijo(c.deducible_pct, 2),
            deducibleMinimo: fijo(c.deducible_minimo, 2),
            topeCobertura: fijo(c.tope_cobertura, 2),
            condicionTaller: c.condicion_taller,
            diasAutoReemplazo: c.dias_auto_reemplazo,
            fuente: c.fuente,
            actualizadoEn: c.actualizado_en,
          },
        };
      })
      .sort(
        (a, b) =>
          a.vista.aseguradora.localeCompare(b.vista.aseguradora, 'es') ||
          a.vista.plan.localeCompare(b.vista.plan, 'es') ||
          a.orden - b.orden,
      )
      .map((x) => x.vista);
  }

  guardarCoberturas(token: string, filas: FilaCobertura[]) {
    return llamarRpc<ResumenCargaChoque>(
      this.db(token),
      'admin_guardar_coberturas',
      {
        p_filas: filas.map((c) => ({
          plan_id: c.planId,
          escenario: c.escenario,
          cubre: c.cubre,
          deducible_pct: c.deduciblePct ?? null,
          deducible_minimo: c.deducibleMinimo ?? null,
          tope_cobertura: c.topeCobertura ?? null,
          condicion_taller: c.condicionTaller ?? 'CUALQUIERA',
          dias_auto_reemplazo: c.diasAutoReemplazo ?? 0,
          fuente: c.fuente,
        })),
      },
    );
  }

  // ── Frecuencias ───────────────────────────────────────────────────────────
  async listarFrecuencias(
    token: string,
    f: { escenario?: string; uso?: UsoVehiculo },
  ): Promise<FrecuenciaVista[]> {
    let q = this.db(token)
      .from('frecuencia_escenario')
      .select(
        'uso, zona, probabilidad_anual, escenario_siniestro!inner(codigo, orden)',
      );
    if (f.uso) q = q.eq('uso', f.uso);
    if (f.escenario) q = q.eq('escenario_siniestro.codigo', f.escenario);
    const filas = datos<
      {
        uso: UsoVehiculo;
        zona: ZonaRiesgo;
        probabilidad_anual: Num;
        escenario_siniestro: Uno<{ codigo: string; orden: number }>;
      }[]
    >(await q);
    return filas
      .map((r) => {
        const e = uno(r.escenario_siniestro);
        return {
          orden: e?.orden ?? 0,
          vista: {
            escenario: e?.codigo ?? '',
            uso: r.uso,
            zona: r.zona,
            probabilidadAnual: new Decimal(r.probabilidad_anual).toFixed(4),
          },
        };
      })
      .sort(
        (a, b) =>
          a.orden - b.orden ||
          a.vista.uso.localeCompare(b.vista.uso) ||
          a.vista.zona.localeCompare(b.vista.zona),
      )
      .map((x) => x.vista);
  }

  guardarFrecuencias(token: string, filas: FilaFrecuencia[]) {
    return llamarRpc<ResumenCargaChoque>(
      this.db(token),
      'admin_guardar_frecuencias',
      {
        p_filas: filas.map((f) => ({
          escenario: f.escenario,
          uso: f.uso,
          zona: f.zona,
          probabilidad_anual: f.probabilidadAnual,
        })),
      },
    );
  }

  // ── Zonas por distrito ────────────────────────────────────────────────────
  async listarZonas(token: string, zona?: ZonaRiesgo): Promise<ZonaVista[]> {
    let q = this.db(token).from('zona_riesgo_distrito').select('ubigeo, zona');
    if (zona) q = q.eq('zona', zona);
    const [filas, ubigeos] = await Promise.all([
      q,
      this.db(token)
        .from('ubigeo')
        .select('codigo, departamento, provincia, distrito'),
    ]);
    const nombres = new Map(
      datos<
        {
          codigo: string;
          departamento: string;
          provincia: string;
          distrito: string;
        }[]
      >(ubigeos).map((u) => [u.codigo, u]),
    );
    return datos<{ ubigeo: string; zona: ZonaRiesgo }[]>(filas)
      .map((z) => {
        const u = nombres.get(z.ubigeo);
        return {
          ubigeo: z.ubigeo,
          departamento: u?.departamento ?? '',
          provincia: u?.provincia ?? '',
          distrito: u?.distrito ?? '',
          zona: z.zona,
        };
      })
      .sort(
        (a, b) =>
          a.provincia.localeCompare(b.provincia, 'es') ||
          a.distrito.localeCompare(b.distrito, 'es'),
      );
  }

  guardarZonas(token: string, filas: FilaZona[]) {
    return llamarRpc<ResumenCargaChoque>(
      this.db(token),
      'admin_guardar_zonas',
      { p_filas: filas.map((z) => ({ ubigeo: z.ubigeo, zona: z.zona })) },
    );
  }

  // ── Factores de perfil ────────────────────────────────────────────────────
  async listarFactores(
    token: string,
    escenario?: string,
  ): Promise<FactorVista[]> {
    let q = this.db(token)
      .from('factor_perfil')
      .select(
        'variable, multiplicador, escenario_siniestro!inner(codigo, orden)',
      );
    if (escenario) q = q.eq('escenario_siniestro.codigo', escenario);
    const filas = datos<
      {
        variable: VariablePerfil;
        multiplicador: Num;
        escenario_siniestro: Uno<{ codigo: string; orden: number }>;
      }[]
    >(await q);
    return filas
      .map((f) => {
        const e = uno(f.escenario_siniestro);
        return {
          orden: e?.orden ?? 0,
          vista: {
            escenario: e?.codigo ?? '',
            variable: f.variable,
            multiplicador: new Decimal(f.multiplicador).toFixed(2),
          },
        };
      })
      .sort(
        (a, b) =>
          a.orden - b.orden || a.vista.variable.localeCompare(b.vista.variable),
      )
      .map((x) => x.vista);
  }

  guardarFactores(token: string, filas: FilaFactor[]) {
    return llamarRpc<ResumenCargaChoque>(
      this.db(token),
      'admin_guardar_factores',
      {
        p_filas: filas.map((f) => ({
          escenario: f.escenario,
          variable: f.variable,
          multiplicador: f.multiplicador,
        })),
      },
    );
  }

  // ── Planes activos ────────────────────────────────────────────────────────
  async planesActivos(token: string): Promise<PlanActivo[]> {
    const filas = datos<
      { id: string; nombre: string; aseguradora: Uno<{ nombre: string }> }[]
    >(
      await this.db(token)
        .from('plan')
        .select('id, nombre, aseguradora!inner(nombre)')
        .eq('activo', true)
        .eq('aseguradora.activa', true),
    );
    return filas
      .map((p) => ({
        planId: p.id,
        plan: p.nombre,
        aseguradora: uno(p.aseguradora)?.nombre ?? '',
      }))
      .sort(
        (a, b) =>
          a.aseguradora.localeCompare(b.aseguradora, 'es') ||
          a.plan.localeCompare(b.plan, 'es'),
      );
  }

  private db(token: string) {
    return this.clientes.paraToken(token);
  }
}
