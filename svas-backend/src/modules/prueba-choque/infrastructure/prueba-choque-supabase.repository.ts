import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { ErrorBaseDatos } from '../../../common/filters/postgrest-error.filter';
import { llamarRpc } from '../../../infrastructure/database/rpc.helper';
import {
  SUPABASE_SERVICE_CLIENT,
  type SupabaseServiceClient,
} from '../../../infrastructure/database/supabase-service-client.provider';
import { SupabaseUserClientFactory } from '../../../infrastructure/database/supabase-user-client.factory';
import type {
  UsoVehiculo,
  VariablePerfil,
  ZonaRiesgo,
} from '../../../shared/types/enums';
import type {
  CatalogoSimulacion,
  EscenarioCatalogo,
  PruebaChoqueRepository,
  SimulacionGuardada,
  SimulacionParaGuardar,
} from '../domain/prueba-choque.repository.port';

type Uno<T> = T | T[] | null;
const uno = <T>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const dec = (v: number | string) => new Decimal(v);
const decONull = (v: number | string | null) =>
  v === null ? null : new Decimal(v);

/** Zona por defecto si el distrito no tiene fila (§4.1). */
const ZONA_POR_DEFECTO: ZonaRiesgo = 'MEDIA';

function datos<T>(r: { data: unknown; error: { message: string } | null }): T {
  if (r.error) throw new ErrorBaseDatos(r.error);
  return r.data as T;
}

interface FilaEscenario {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  monto_dano_referencial: number | null;
  dias_taller_estimados: number;
  orden: number;
}

interface FilaSimulacion {
  id: string;
  zona: ZonaRiesgo;
  fecha: string;
  vigente: boolean;
  simulacion_plan: {
    prima_cotizada_id: string;
    costo_real_anual: number;
    peor_caso: number;
    ranking: number;
    datos_completos: boolean;
    prima_cotizada: Uno<{
      plan: Uno<{ nombre: string; aseguradora: Uno<{ nombre: string }> }>;
    }>;
  }[];
  simulacion_resultado: {
    prima_cotizada_id: string;
    escenario_id: string;
    sin_dato: boolean;
    cubre: boolean | null;
    probabilidad_usada: number;
    deducible_aplicado: number;
    no_cubierto: number;
    ingreso_perdido: number;
    desembolso_cliente: number;
    escenario_siniestro: Uno<{ codigo: string; nombre: string; orden: number }>;
  }[];
}

@Injectable()
export class PruebaChoqueSupabaseRepository implements PruebaChoqueRepository {
  constructor(
    @Inject(SUPABASE_SERVICE_CLIENT)
    private readonly servicio: SupabaseServiceClient,
    private readonly clientes: SupabaseUserClientFactory,
  ) {}

  async escenariosActivos(): Promise<EscenarioCatalogo[]> {
    const filas = datos<FilaEscenario[]>(
      await this.servicio
        .from('escenario_siniestro')
        .select(
          'id, codigo, nombre, descripcion, monto_dano_referencial, dias_taller_estimados, orden',
        )
        .eq('activo', true)
        .order('orden'),
    );
    return filas.map((f) => ({
      id: f.id,
      codigo: f.codigo,
      nombre: f.nombre,
      descripcion: f.descripcion,
      montoDano: decONull(f.monto_dano_referencial),
      diasTaller: f.dias_taller_estimados,
      orden: f.orden,
    }));
  }

  async probabilidadesReferenciales(uso: UsoVehiculo) {
    return this.probabilidades(uso, ZONA_POR_DEFECTO);
  }

  private async probabilidades(uso: UsoVehiculo, zona: ZonaRiesgo) {
    const filas = datos<{ escenario_id: string; probabilidad_anual: number }[]>(
      await this.servicio
        .from('frecuencia_escenario')
        .select('escenario_id, probabilidad_anual')
        .eq('uso', uso)
        .eq('zona', zona),
    );
    return new Map(
      filas.map((f) => [f.escenario_id, dec(f.probabilidad_anual)]),
    );
  }

  async catalogo(d: {
    planIds: string[];
    uso: UsoVehiculo;
    ubigeo: string;
  }): Promise<CatalogoSimulacion> {
    const filaZona = datos<{ zona: ZonaRiesgo } | null>(
      await this.servicio
        .from('zona_riesgo_distrito')
        .select('zona')
        .eq('ubigeo', d.ubigeo)
        .maybeSingle(),
    );
    const zona = filaZona?.zona ?? ZONA_POR_DEFECTO;

    const [escenarios, reglas, probabilidades, factores, parametros] =
      await Promise.all([
        this.escenariosActivos(),
        this.servicio
          .from('cobertura_plan_escenario')
          .select(
            'plan_id, escenario_id, cubre, deducible_pct, deducible_minimo, tope_cobertura, dias_auto_reemplazo',
          )
          .in('plan_id', d.planIds),
        this.probabilidades(d.uso, zona),
        this.servicio
          .from('factor_perfil')
          .select('escenario_id, variable, multiplicador'),
        this.servicio
          .from('parametros_comerciales')
          .select('tipo_cambio_referencial')
          .eq('id', 1)
          .single(),
      ]);

    return {
      zona,
      escenarios,
      reglas: datos<
        {
          plan_id: string;
          escenario_id: string;
          cubre: boolean;
          deducible_pct: number | null;
          deducible_minimo: number | null;
          tope_cobertura: number | null;
          dias_auto_reemplazo: number;
        }[]
      >(reglas).map((r) => ({
        planId: r.plan_id,
        escenarioId: r.escenario_id,
        cubre: r.cubre,
        deduciblePct: decONull(r.deducible_pct),
        deducibleMinimo: decONull(r.deducible_minimo),
        tope: decONull(r.tope_cobertura),
        diasReemplazo: r.dias_auto_reemplazo,
      })),
      probabilidades,
      factores: datos<
        {
          escenario_id: string;
          variable: VariablePerfil;
          multiplicador: number;
        }[]
      >(factores).map((f) => ({
        escenarioId: f.escenario_id,
        variable: f.variable,
        multiplicador: dec(f.multiplicador),
      })),
      tipoCambio: dec(
        datos<{ tipo_cambio_referencial: number }>(parametros)
          .tipo_cambio_referencial,
      ),
    };
  }

  async registrar(
    cotizacionId: string,
    s: SimulacionParaGuardar,
    accessToken?: string,
  ) {
    const cliente = accessToken
      ? this.clientes.paraToken(accessToken)
      : this.servicio;
    const r = await llamarRpc<{ simulacion_id: string }>(
      cliente,
      'registrar_simulacion',
      {
        p_cotizacion_id: cotizacionId,
        p_payload: {
          perfil: s.perfil,
          zona: s.zona,
          version_reglas: s.versionReglas,
          planes: s.planes.map((p) => ({
            prima_cotizada_id: p.primaCotizadaId,
            costo_real_anual: p.costoRealAnual,
            peor_caso: p.peorCaso,
            ranking: p.ranking,
            datos_completos: p.datosCompletos,
          })),
          resultados: s.resultados.map((x) => ({
            prima_cotizada_id: x.primaCotizadaId,
            escenario_id: x.escenarioId,
            sin_dato: x.sinDato,
            cubre: x.cubre,
            probabilidad_usada: x.probabilidad,
            monto_dano_usado: x.dano,
            monto_cubierto: x.cubierto,
            deducible_aplicado: x.deducible,
            no_cubierto: x.noCubierto,
            ingreso_perdido: x.ingresoPerdido,
            desembolso_cliente: x.desembolso,
          })),
        },
      },
    );
    return { simulacionId: r.simulacion_id };
  }

  async ultima(cotizacionId: string): Promise<SimulacionGuardada | null> {
    const f = datos<FilaSimulacion | null>(
      await this.servicio
        .from('simulacion')
        .select(
          `id, zona, fecha, vigente,
           simulacion_plan(prima_cotizada_id, costo_real_anual, peor_caso, ranking, datos_completos,
             prima_cotizada(plan(nombre, aseguradora(nombre)))),
           simulacion_resultado(prima_cotizada_id, escenario_id, sin_dato, cubre, probabilidad_usada,
             deducible_aplicado, no_cubierto, ingreso_perdido, desembolso_cliente,
             escenario_siniestro(codigo, nombre, orden))`,
        )
        .eq('cotizacion_id', cotizacionId)
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    if (!f) return null;
    return {
      id: f.id,
      zona: f.zona,
      fecha: f.fecha,
      vigente: f.vigente,
      planes: f.simulacion_plan.map((p) => {
        const plan = uno(uno(p.prima_cotizada)?.plan ?? null);
        return {
          primaCotizadaId: p.prima_cotizada_id,
          aseguradora: uno(plan?.aseguradora ?? null)?.nombre ?? '',
          plan: plan?.nombre ?? '',
          costoRealAnual: dec(p.costo_real_anual),
          peorCaso: dec(p.peor_caso),
          ranking: p.ranking,
          datosCompletos: p.datos_completos,
        };
      }),
      resultados: f.simulacion_resultado.map((x) => {
        const e = uno(x.escenario_siniestro);
        return {
          primaCotizadaId: x.prima_cotizada_id,
          escenario: {
            id: x.escenario_id,
            codigo: e?.codigo ?? '',
            nombre: e?.nombre ?? '',
            orden: e?.orden ?? 0,
          },
          sinDato: x.sin_dato,
          cubre: x.cubre,
          probabilidad: dec(x.probabilidad_usada),
          deducible: dec(x.deducible_aplicado),
          noCubierto: dec(x.no_cubierto),
          ingresoPerdido: dec(x.ingreso_perdido),
          desembolso: dec(x.desembolso_cliente),
        };
      }),
    };
  }
}
