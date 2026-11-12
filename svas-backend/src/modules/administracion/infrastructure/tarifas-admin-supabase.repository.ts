import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { ErrorBaseDatos } from '../../../common/filters/postgrest-error.filter';
import { SupabaseUserClientFactory } from '../../../infrastructure/database/supabase-user-client.factory';
import type { PesoNombre } from '../../cotizacion/domain/tarifa.types';
import type {
  FaltanteTarifa,
  FilaPeso,
  FilaRango,
  PesoVista,
  RangoVista,
  ResumenCarga,
  TablaPeso,
  TarifaPlanVista,
} from '../domain/tarifas';
import type {
  AseguradoraTarifa,
  TarifasAdminRepository,
} from '../domain/tarifas-admin.repository.port';

type Num = number | string;
/** PostgREST devuelve una relación a-uno como objeto, pero el tipo puede venir como arreglo. */
type Uno<T> = T | T[] | null;
const uno = <T>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

interface FilaTarifaPlan {
  tasa_base: Num;
  parametros: Record<string, unknown>;
  actualizado_en: string;
}
interface FilaPlanConTarifa {
  id: string;
  nombre: string;
  aseguradora_id: string;
  tarifa_plan: Uno<FilaTarifaPlan>;
}
interface FilaRangoDb {
  modelo_id: string;
  anio: number;
  suma_minima: Num;
  suma_maxima: Num;
  modelo: Uno<{ nombre: string; marca: Uno<{ nombre: string }> }>;
}
interface FilaFaltante {
  aseguradora_id: string;
  codigo_estrategia: string;
  modelo_id: string;
  marca: string;
  modelo: string;
  anio: number;
  tiene_rango: boolean;
  pesos_faltantes: PesoNombre[];
}

/** Tabla de pesos → columna clave y cómo leer el nombre legible de cada clave. */
const PESOS: Record<TablaPeso, { tabla: string; clave: string }> = {
  marca: { tabla: 'peso_marca', clave: 'marca_id' },
  modelo: { tabla: 'peso_modelo', clave: 'modelo_id' },
  anio: { tabla: 'peso_anio', clave: 'anio' },
  tipo: { tabla: 'peso_tipo', clave: 'tipo_id' },
  ubigeo: { tabla: 'peso_ubigeo', clave: 'ubigeo' },
};

const dinero = (v: Num) => new Decimal(v).toFixed(2);
const peso = (v: Num) => new Decimal(v).toFixed(3);
const tasa = (v: Num) => new Decimal(v).toFixed(4);

@Injectable()
export class TarifasAdminSupabaseRepository implements TarifasAdminRepository {
  constructor(private readonly clientes: SupabaseUserClientFactory) {}

  async listarAseguradoras(token: string): Promise<AseguradoraTarifa[]> {
    const { data, error } = await this.db(token)
      .from('aseguradora')
      .select('id, nombre, activa, codigo_estrategia')
      .order('nombre');
    if (error) throw new ErrorBaseDatos(error);
    return (
      data as {
        id: string;
        nombre: string;
        activa: boolean;
        codigo_estrategia: string;
      }[]
    ).map((a) => ({
      id: a.id,
      nombre: a.nombre,
      activa: a.activa,
      codigoEstrategia: a.codigo_estrategia,
    }));
  }

  async codigoEstrategiaDelPlan(
    token: string,
    planId: string,
  ): Promise<string | null> {
    const { data, error } = await this.db(token)
      .from('plan')
      .select('aseguradora(codigo_estrategia)')
      .eq('id', planId)
      .maybeSingle();
    if (error) throw new ErrorBaseDatos(error);
    if (!data) return null;
    const aseg = uno(
      (data as { aseguradora: Uno<{ codigo_estrategia: string }> }).aseguradora,
    );
    return aseg?.codigo_estrategia ?? null;
  }

  // ── Tasa base y parámetros por plan ───────────────────────────────────────
  async listarTarifasPlanes(token: string, aseguradoraId?: string) {
    let q = this.db(token)
      .from('plan')
      .select(
        'id, nombre, aseguradora_id, tarifa_plan(tasa_base, parametros, actualizado_en)',
      )
      .order('aseguradora_id')
      .order('nombre');
    if (aseguradoraId) q = q.eq('aseguradora_id', aseguradoraId);
    const { data, error } = await q;
    if (error) throw new ErrorBaseDatos(error);
    return (data as FilaPlanConTarifa[]).map((p) => {
      const t = uno(p.tarifa_plan);
      return {
        planId: p.id,
        plan: p.nombre,
        aseguradoraId: p.aseguradora_id,
        tasaBase: t ? tasa(t.tasa_base) : null,
        parametros: t?.parametros ?? null,
        actualizadoEn: t?.actualizado_en ?? null,
      };
    });
  }

  async guardarTarifaPlan(
    token: string,
    planId: string,
    tasaBase: number,
    parametros: Record<string, unknown>,
  ): Promise<TarifaPlanVista> {
    await this.rpc(token, 'admin_guardar_tarifa_plan', {
      p_plan_id: planId,
      p_tasa_base: tasaBase,
      p_parametros: parametros,
    });
    const [vista] = (await this.listarTarifasPlanes(token)).filter(
      (t) => t.planId === planId,
    );
    return vista;
  }

  // ── Pesos ─────────────────────────────────────────────────────────────────
  async listarPesos(
    token: string,
    tabla: TablaPeso,
    aseguradoraId: string,
  ): Promise<PesoVista[]> {
    const { tabla: nombreTabla, clave } = PESOS[tabla];
    const [filas, nombres] = await Promise.all([
      this.db(token)
        .from(nombreTabla)
        .select(`${clave}, peso`)
        .eq('aseguradora_id', aseguradoraId)
        .order(clave),
      this.nombresDeClaves(token, tabla),
    ]);
    if (filas.error) throw new ErrorBaseDatos(filas.error);
    return (filas.data as unknown as Record<string, Num>[])
      .map((f) => {
        const c = String(f[clave]);
        return { clave: c, nombre: nombres.get(c) ?? c, peso: peso(f.peso) };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  guardarPesos(
    token: string,
    tabla: TablaPeso,
    aseguradoraId: string,
    filas: FilaPeso[],
  ) {
    return this.rpc<ResumenCarga>(token, 'admin_guardar_pesos', {
      p_tabla: tabla,
      p_aseguradora_id: aseguradoraId,
      p_filas: filas.map((f) => ({ clave: f.clave, peso: f.peso })),
    });
  }

  /** Nombre legible de cada clave (Toyota, Toyota Corolla, Miraflores (Lima)…). */
  private async nombresDeClaves(
    token: string,
    tabla: TablaPeso,
  ): Promise<Map<string, string>> {
    const db = this.db(token);
    switch (tabla) {
      case 'anio':
        return new Map();
      case 'marca': {
        const { data, error } = await db.from('marca').select('id, nombre');
        if (error) throw new ErrorBaseDatos(error);
        return new Map(
          (data as { id: string; nombre: string }[]).map((m) => [
            m.id,
            m.nombre,
          ]),
        );
      }
      case 'tipo': {
        const { data, error } = await db
          .from('tipo_vehiculo')
          .select('id, nombre');
        if (error) throw new ErrorBaseDatos(error);
        return new Map(
          (data as { id: string; nombre: string }[]).map((t) => [
            t.id,
            t.nombre,
          ]),
        );
      }
      case 'modelo': {
        const { data, error } = await db
          .from('modelo')
          .select('id, nombre, marca(nombre)');
        if (error) throw new ErrorBaseDatos(error);
        return new Map(
          (
            data as {
              id: string;
              nombre: string;
              marca: Uno<{ nombre: string }>;
            }[]
          ).map((m) => [
            m.id,
            `${uno(m.marca)?.nombre ?? ''} ${m.nombre}`.trim(),
          ]),
        );
      }
      case 'ubigeo': {
        const { data, error } = await db
          .from('ubigeo')
          .select('codigo, provincia, distrito');
        if (error) throw new ErrorBaseDatos(error);
        return new Map(
          (
            data as { codigo: string; provincia: string; distrito: string }[]
          ).map((u) => [u.codigo, `${u.distrito} (${u.provincia})`]),
        );
      }
    }
  }

  // ── Rangos de suma asegurada ──────────────────────────────────────────────
  async listarRangos(
    token: string,
    f: { aseguradoraId: string; marcaId?: string; modeloId?: string },
  ): Promise<RangoVista[]> {
    let q = this.db(token)
      .from('rango_suma_asegurada')
      .select(
        'modelo_id, anio, suma_minima, suma_maxima, modelo!inner(nombre, marca_id, marca(nombre))',
      )
      .eq('aseguradora_id', f.aseguradoraId);
    if (f.modeloId) q = q.eq('modelo_id', f.modeloId);
    if (f.marcaId) q = q.eq('modelo.marca_id', f.marcaId);
    const { data, error } = await q;
    if (error) throw new ErrorBaseDatos(error);
    return (data as unknown as FilaRangoDb[])
      .map((r) => {
        const modelo = uno(r.modelo);
        return {
          modeloId: r.modelo_id,
          marca: uno(modelo?.marca ?? null)?.nombre ?? '',
          modelo: modelo?.nombre ?? '',
          anio: r.anio,
          sumaMinima: dinero(r.suma_minima),
          sumaMaxima: dinero(r.suma_maxima),
        };
      })
      .sort(
        (a, b) =>
          a.marca.localeCompare(b.marca, 'es') ||
          a.modelo.localeCompare(b.modelo, 'es') ||
          a.anio - b.anio,
      );
  }

  guardarRangos(token: string, aseguradoraId: string, filas: FilaRango[]) {
    return this.rpc<ResumenCarga>(token, 'admin_guardar_rangos_suma', {
      p_aseguradora_id: aseguradoraId,
      p_filas: filas.map((r) => ({
        modelo_id: r.modeloId,
        anio: r.anio,
        suma_minima: r.sumaMinima,
        suma_maxima: r.sumaMaxima,
      })),
    });
  }

  // ── Completitud ───────────────────────────────────────────────────────────
  async listarFaltantes(
    token: string,
    aseguradoraId: string,
    pesosRequeridos: readonly PesoNombre[],
  ): Promise<FaltanteTarifa[]> {
    let q = this.db(token)
      .from('v_tarifa_completitud')
      .select(
        'aseguradora_id, codigo_estrategia, modelo_id, marca, modelo, anio, tiene_rango, pesos_faltantes',
      )
      .eq('aseguradora_id', aseguradoraId)
      .order('marca')
      .order('modelo')
      .order('anio');
    q = pesosRequeridos.length
      ? q.or(
          `tiene_rango.is.false,pesos_faltantes.ov.{${pesosRequeridos.join(',')}}`,
        )
      : q.eq('tiene_rango', false);
    const { data, error } = await q;
    if (error) throw new ErrorBaseDatos(error);
    return (data as FilaFaltante[]).map((f) => ({
      aseguradoraId: f.aseguradora_id,
      codigoEstrategia: f.codigo_estrategia,
      modeloId: f.modelo_id,
      marca: f.marca,
      modelo: f.modelo,
      anio: f.anio,
      sinRango: !f.tiene_rango,
      pesosFaltantes: f.pesos_faltantes.filter((p) =>
        pesosRequeridos.includes(p),
      ),
    }));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private db(token: string) {
    return this.clientes.paraToken(token);
  }

  private async rpc<T>(
    token: string,
    nombre: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await this.db(token).rpc(nombre, params);
    if (error) throw new ErrorBaseDatos(error);
    return data as T;
  }
}
