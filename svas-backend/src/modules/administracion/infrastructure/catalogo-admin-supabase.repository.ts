import { ConflictException, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { ErrorBaseDatos } from '../../../common/filters/postgrest-error.filter';
import { SupabaseUserClientFactory } from '../../../infrastructure/database/supabase-user-client.factory';
import type { TipoCampo, UsoVehiculo } from '../../../shared/types/enums';
import type {
  Aseguradora,
  Campo,
  EntradaBitacora,
  OrigenValores,
  ParametrosComerciales,
  Plan,
  ReglaInspeccion,
} from '../domain/catalogo';
import type {
  CambiosParametros,
  CatalogoAdminRepository,
  FiltrosBitacora,
  GuardarCampo,
  PaginaBitacora,
  ResumenPanel,
} from '../domain/catalogo-admin.repository.port';

// ── Filas tal como las devuelve PostgREST / to_jsonb ─────────────────────────
interface FilaAseguradora {
  id: string;
  nombre: string;
  activa: boolean;
  codigo_estrategia: string;
}
interface FilaPlan {
  id: string;
  aseguradora_id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}
interface FilaCampo {
  id: string;
  aseguradora_id: string;
  nombre: string;
  tipo: TipoCampo;
  obligatorio: boolean;
  activo: boolean;
  origen_valores: OrigenValores;
  valores?: string[];
  valor_permitido?: { valor: string }[];
}
interface FilaRegla {
  aseguradora_id: string;
  uso: UsoVehiculo;
  requiere_inspeccion: boolean;
}
interface FilaParametros {
  descuento_primera_compra: number | string;
  descuento_maximo: number | string;
  max_intentos: number;
  dias_seguimiento: number;
  max_cuotas: number;
  vigencia_enlace_dias: number;
  horas_abandono: number;
  moneda: string;
  tipo_cambio_referencial: number | string;
}
interface FilaBitacora {
  id: string;
  usuario_id: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  detalle: unknown;
  fecha: string;
}

const COL_ASEGURADORA = 'id, nombre, activa, codigo_estrategia';
const COL_PLAN = 'id, aseguradora_id, nombre, descripcion, activo';
const COL_CAMPO =
  'id, aseguradora_id, nombre, tipo, obligatorio, activo, origen_valores, valor_permitido(valor)';
const COL_REGLA = 'aseguradora_id, uso, requiere_inspeccion';
const COL_BITACORA =
  'id, usuario_id, accion, entidad, entidad_id, detalle, fecha';

/** camelCase del DTO → columna de parametros_comerciales. */
const COLUMNA_PARAMETRO: Record<keyof CambiosParametros, string> = {
  descuentoPrimeraCompra: 'descuento_primera_compra',
  descuentoMaximo: 'descuento_maximo',
  maxIntentos: 'max_intentos',
  diasSeguimiento: 'dias_seguimiento',
  maxCuotas: 'max_cuotas',
  vigenciaEnlaceDias: 'vigencia_enlace_dias',
  horasAbandono: 'horas_abandono',
  moneda: 'moneda',
  tipoCambioReferencial: 'tipo_cambio_referencial',
};

@Injectable()
export class CatalogoAdminSupabaseRepository implements CatalogoAdminRepository {
  constructor(private readonly clientes: SupabaseUserClientFactory) {}

  // ── Aseguradoras ──────────────────────────────────────────────────────────
  async listarAseguradoras(token: string): Promise<Aseguradora[]> {
    const { data, error } = await this.db(token)
      .from('aseguradora')
      .select(COL_ASEGURADORA)
      .order('nombre');
    if (error) throw new ErrorBaseDatos(error);
    return (data as FilaAseguradora[]).map(aAseguradora);
  }

  async cambiarEstadoAseguradora(token: string, id: string, activa: boolean) {
    return aAseguradora(
      await this.rpc<FilaAseguradora>(
        token,
        'admin_cambiar_estado_aseguradora',
        {
          p_aseguradora_id: id,
          p_activa: activa,
        },
      ),
    );
  }

  // ── Planes ────────────────────────────────────────────────────────────────
  async listarPlanes(token: string, aseguradoraId?: string): Promise<Plan[]> {
    let q = this.db(token).from('plan').select(COL_PLAN).order('nombre');
    if (aseguradoraId) q = q.eq('aseguradora_id', aseguradoraId);
    const { data, error } = await q;
    if (error) throw new ErrorBaseDatos(error);
    return (data as FilaPlan[]).map(aPlan);
  }

  async buscarPlan(token: string, id: string): Promise<Plan | null> {
    const { data, error } = await this.db(token)
      .from('plan')
      .select(COL_PLAN)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new ErrorBaseDatos(error);
    return data ? aPlan(data as FilaPlan) : null;
  }

  async crearPlan(
    token: string,
    aseguradoraId: string,
    nombre: string,
    descripcion: string | null,
  ) {
    return aPlan(
      await this.rpc<FilaPlan>(
        token,
        'admin_guardar_plan',
        {
          p_plan_id: null,
          p_aseguradora_id: aseguradoraId,
          p_nombre: nombre,
          p_descripcion: descripcion,
        },
        'Ya existe un plan con ese nombre en la aseguradora',
      ),
    );
  }

  async editarPlan(
    token: string,
    id: string,
    nombre: string,
    descripcion: string | null,
  ) {
    return aPlan(
      await this.rpc<FilaPlan>(
        token,
        'admin_guardar_plan',
        {
          p_plan_id: id,
          p_aseguradora_id: null,
          p_nombre: nombre,
          p_descripcion: descripcion,
        },
        'Ya existe un plan con ese nombre en la aseguradora',
      ),
    );
  }

  async cambiarEstadoPlan(token: string, id: string, activo: boolean) {
    return aPlan(
      await this.rpc<FilaPlan>(token, 'admin_cambiar_estado_plan', {
        p_plan_id: id,
        p_activo: activo,
      }),
    );
  }

  // ── Campos ────────────────────────────────────────────────────────────────
  async listarCampos(token: string, aseguradoraId?: string): Promise<Campo[]> {
    let q = this.db(token)
      .from('campo_requerido')
      .select(COL_CAMPO)
      .order('nombre');
    if (aseguradoraId) q = q.eq('aseguradora_id', aseguradoraId);
    const { data, error } = await q;
    if (error) throw new ErrorBaseDatos(error);
    return (data as FilaCampo[]).map(aCampo);
  }

  async crearCampo(token: string, aseguradoraId: string, c: GuardarCampo) {
    return aCampo(await this.guardarCampo(token, null, aseguradoraId, c));
  }

  async editarCampo(token: string, id: string, c: GuardarCampo) {
    return aCampo(await this.guardarCampo(token, id, null, c));
  }

  async cambiarEstadoCampo(token: string, id: string, activo: boolean) {
    return aCampo(
      await this.rpc<FilaCampo>(token, 'admin_cambiar_estado_campo', {
        p_campo_id: id,
        p_activo: activo,
      }),
    );
  }

  private guardarCampo(
    token: string,
    id: string | null,
    aseguradoraId: string | null,
    c: GuardarCampo,
  ) {
    return this.rpc<FilaCampo>(
      token,
      'admin_guardar_campo',
      {
        p_campo_id: id,
        p_aseguradora_id: aseguradoraId,
        p_nombre: c.nombre,
        p_tipo: c.tipo,
        p_obligatorio: c.obligatorio,
        p_origen_valores: c.origenValores,
        p_valores: c.valores,
        p_activo: c.activo ?? true,
      },
      'La aseguradora ya tiene un campo con ese nombre',
    );
  }

  // ── Reglas de inspección ──────────────────────────────────────────────────
  async listarReglas(token: string): Promise<ReglaInspeccion[]> {
    const { data, error } = await this.db(token)
      .from('regla_inspeccion')
      .select(COL_REGLA)
      .order('aseguradora_id')
      .order('uso');
    if (error) throw new ErrorBaseDatos(error);
    return (data as FilaRegla[]).map(aRegla);
  }

  async guardarReglas(token: string, reglas: ReglaInspeccion[]) {
    const filas = await this.rpc<FilaRegla[]>(
      token,
      'admin_guardar_regla_inspeccion',
      {
        p_reglas: reglas.map((r) => ({
          aseguradora_id: r.aseguradoraId,
          uso: r.uso,
          requiere_inspeccion: r.requiereInspeccion,
        })),
      },
    );
    return filas.map(aRegla);
  }

  // ── Parámetros ────────────────────────────────────────────────────────────
  async obtenerParametros(token: string): Promise<ParametrosComerciales> {
    const { data, error } = await this.db(token)
      .from('parametros_comerciales')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw new ErrorBaseDatos(error);
    return aParametros(data as FilaParametros);
  }

  async actualizarParametros(token: string, cambios: CambiosParametros) {
    const p_cambios: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor !== undefined) {
        p_cambios[COLUMNA_PARAMETRO[clave as keyof CambiosParametros]] = valor;
      }
    }
    return aParametros(
      await this.rpc<FilaParametros>(token, 'admin_actualizar_parametros', {
        p_cambios,
      }),
    );
  }

  // ── Bitácora y panel ──────────────────────────────────────────────────────
  async listarBitacora(
    token: string,
    f: FiltrosBitacora,
  ): Promise<PaginaBitacora> {
    const desde = (f.pagina - 1) * f.tamano;
    let q = this.db(token)
      .from('registro_actividad')
      .select(COL_BITACORA, { count: 'exact' })
      .order('fecha', { ascending: false })
      .range(desde, desde + f.tamano - 1);
    if (f.entidad) q = q.eq('entidad', f.entidad);
    if (f.desde) q = q.gte('fecha', f.desde.toISOString());
    if (f.hasta) q = q.lte('fecha', f.hasta.toISOString());

    const { data, count, error } = await q;
    if (error) throw new ErrorBaseDatos(error);
    return {
      items: (data as FilaBitacora[]).map(aBitacora),
      total: count ?? 0,
      pagina: f.pagina,
      tamano: f.tamano,
    };
  }

  async resumenPanel(token: string): Promise<ResumenPanel> {
    const [asegT, asegA, planT, planA, campoT, campoA, ultimos] =
      await Promise.all([
        this.contar(token, 'aseguradora'),
        this.contar(token, 'aseguradora', 'activa'),
        this.contar(token, 'plan'),
        this.contar(token, 'plan', 'activo'),
        this.contar(token, 'campo_requerido'),
        this.contar(token, 'campo_requerido', 'activo'),
        this.listarBitacora(token, { pagina: 1, tamano: 10 }),
      ]);
    return {
      aseguradoras: { total: asegT, activas: asegA },
      planes: { total: planT, activos: planA },
      campos: { total: campoT, activos: campoA },
      ultimosCambios: ultimos.items,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private db(token: string) {
    return this.clientes.paraToken(token);
  }

  private async contar(
    token: string,
    tabla: string,
    columnaActiva?: string,
  ): Promise<number> {
    let q = this.db(token)
      .from(tabla)
      .select('id', { count: 'exact', head: true });
    if (columnaActiva) q = q.eq(columnaActiva, true);
    const { count, error } = await q;
    if (error) throw new ErrorBaseDatos(error);
    return count ?? 0;
  }

  /** RPC con el JWT del admin; 23505 → 409 con un mensaje propio del caso. */
  private async rpc<T>(
    token: string,
    nombre: string,
    params: Record<string, unknown>,
    mensajeDuplicado?: string,
  ): Promise<T> {
    const { data, error } = await this.db(token).rpc(nombre, params);
    if (error) {
      if (error.code === '23505' && mensajeDuplicado) {
        throw new ConflictException(mensajeDuplicado);
      }
      throw new ErrorBaseDatos(error);
    }
    return data as T;
  }
}

// ── Mapeos fila → dominio ────────────────────────────────────────────────────
function aAseguradora(f: FilaAseguradora): Aseguradora {
  return {
    id: f.id,
    nombre: f.nombre,
    activa: f.activa,
    codigoEstrategia: f.codigo_estrategia,
  };
}

function aPlan(f: FilaPlan): Plan {
  return {
    id: f.id,
    aseguradoraId: f.aseguradora_id,
    nombre: f.nombre,
    descripcion: f.descripcion,
    activo: f.activo,
  };
}

function aCampo(f: FilaCampo): Campo {
  const valores = f.valores ?? (f.valor_permitido ?? []).map((v) => v.valor);
  return {
    id: f.id,
    aseguradoraId: f.aseguradora_id,
    nombre: f.nombre,
    tipo: f.tipo,
    obligatorio: f.obligatorio,
    activo: f.activo,
    origenValores: f.origen_valores,
    valores: [...valores].sort((a, b) => a.localeCompare(b, 'es')),
  };
}

function aRegla(f: FilaRegla): ReglaInspeccion {
  return {
    aseguradoraId: f.aseguradora_id,
    uso: f.uso,
    requiereInspeccion: f.requiere_inspeccion,
  };
}

function aParametros(f: FilaParametros): ParametrosComerciales {
  return {
    descuentoPrimeraCompra: new Decimal(f.descuento_primera_compra).toFixed(2),
    descuentoMaximo: new Decimal(f.descuento_maximo).toFixed(2),
    maxIntentos: f.max_intentos,
    diasSeguimiento: f.dias_seguimiento,
    maxCuotas: f.max_cuotas,
    vigenciaEnlaceDias: f.vigencia_enlace_dias,
    horasAbandono: f.horas_abandono,
    moneda: f.moneda,
    tipoCambioReferencial: new Decimal(f.tipo_cambio_referencial).toFixed(4),
  };
}

function aBitacora(f: FilaBitacora): EntradaBitacora {
  return {
    id: f.id,
    usuarioId: f.usuario_id,
    accion: f.accion,
    entidad: f.entidad,
    entidadId: f.entidad_id,
    detalle: f.detalle,
    fecha: f.fecha,
  };
}
