import { Inject, Injectable } from '@nestjs/common';
import { ErrorBaseDatos } from '../../../common/filters/postgrest-error.filter';
import {
  SUPABASE_SERVICE_CLIENT,
  type SupabaseServiceClient,
} from '../../../infrastructure/database/supabase-service-client.provider';
import type { TipoCampo, UsoVehiculo } from '../../../shared/types/enums';
import type {
  AseguradoraActiva,
  CatalogoPublicoRepository,
} from '../domain/catalogo-publico.port';
import type { ReglaInspeccion } from '../domain/cotizacion';
import type { CampoAseguradora } from '../domain/formulario-dinamico';

type Uno<T> = T | T[] | null;
const uno = <T>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const unicos = <T>(xs: T[]) => [...new Set(xs)];
const alfabetico = (a: string, b: string) => a.localeCompare(b, 'es');

/**
 * El cotizador es público (se cotiza sin cuenta): lee con service_role y
 * filtra a mano lo inactivo, igual que haría la RLS. Solo catálogo, nunca tarifas.
 */
@Injectable()
export class CatalogoPublicoSupabaseRepository implements CatalogoPublicoRepository {
  constructor(
    @Inject(SUPABASE_SERVICE_CLIENT)
    private readonly db: SupabaseServiceClient,
  ) {}

  async aseguradorasActivas(): Promise<AseguradoraActiva[]> {
    const { data, error } = await this.db
      .from('aseguradora')
      .select('id, nombre, codigo_estrategia')
      .eq('activa', true)
      .order('nombre');
    if (error) throw new ErrorBaseDatos(error);
    return (
      data as { id: string; nombre: string; codigo_estrategia: string }[]
    ).map((a) => ({
      id: a.id,
      nombre: a.nombre,
      codigoEstrategia: a.codigo_estrategia,
    }));
  }

  async camposActivos(): Promise<CampoAseguradora[]> {
    const { data, error } = await this.db
      .from('campo_requerido')
      .select(
        'nombre, tipo, obligatorio, origen_valores, aseguradora!inner(nombre, activa), valor_permitido(valor)',
      )
      .eq('activo', true)
      .eq('aseguradora.activa', true);
    if (error) throw new ErrorBaseDatos(error);
    type Fila = {
      nombre: string;
      tipo: TipoCampo;
      obligatorio: boolean;
      origen_valores: 'ESTATICO' | 'CATALOGO';
      aseguradora: Uno<{ nombre: string }>;
      valor_permitido: { valor: string }[] | null;
    };
    return (data as unknown as Fila[]).map((c) => ({
      aseguradora: uno(c.aseguradora)?.nombre ?? '',
      nombre: c.nombre,
      tipo: c.tipo,
      obligatorio: c.obligatorio,
      origenValores: c.origen_valores,
      valores: (c.valor_permitido ?? []).map((v) => v.valor),
    }));
  }

  async reglasInspeccion(): Promise<ReglaInspeccion[]> {
    const { data, error } = await this.db
      .from('regla_inspeccion')
      .select(
        'aseguradora_id, uso, requiere_inspeccion, aseguradora!inner(activa)',
      )
      .eq('aseguradora.activa', true);
    if (error) throw new ErrorBaseDatos(error);
    return (
      data as unknown as {
        aseguradora_id: string;
        uso: UsoVehiculo;
        requiere_inspeccion: boolean;
      }[]
    ).map((r) => ({
      aseguradoraId: r.aseguradora_id,
      uso: r.uso,
      requiereInspeccion: r.requiere_inspeccion,
    }));
  }

  /** Marcas activas con al menos un modelo activo. */
  async marcas() {
    const { data, error } = await this.db
      .from('marca')
      .select('id, nombre, modelo!inner(id)')
      .eq('activa', true)
      .eq('modelo.activo', true)
      .order('nombre');
    if (error) throw new ErrorBaseDatos(error);
    return (data as { id: string; nombre: string }[]).map((m) => ({
      id: m.id,
      nombre: m.nombre,
    }));
  }

  async modelos(marcaId: string) {
    const { data, error } = await this.db
      .from('modelo')
      .select('id, nombre, tipo_vehiculo(nombre), marca!inner(activa)')
      .eq('marca_id', marcaId)
      .eq('activo', true)
      .eq('marca.activa', true)
      .order('nombre');
    if (error) throw new ErrorBaseDatos(error);
    type Fila = {
      id: string;
      nombre: string;
      tipo_vehiculo: Uno<{ nombre: string }>;
    };
    return (data as unknown as Fila[]).map((m) => ({
      id: m.id,
      nombre: m.nombre,
      tipo: uno(m.tipo_vehiculo)?.nombre ?? '',
    }));
  }

  async anios(modeloId: string) {
    const { data, error } = await this.db
      .from('rango_suma_asegurada')
      .select('anio, aseguradora!inner(activa)')
      .eq('modelo_id', modeloId)
      .eq('aseguradora.activa', true);
    if (error) throw new ErrorBaseDatos(error);
    return unicos((data as { anio: number }[]).map((r) => r.anio)).sort(
      (a, b) => b - a,
    );
  }

  async departamentos() {
    const { data, error } = await this.db.from('ubigeo').select('departamento');
    if (error) throw new ErrorBaseDatos(error);
    return unicos(
      (data as { departamento: string }[]).map((u) => u.departamento),
    ).sort(alfabetico);
  }

  async provincias(departamento: string) {
    const { data, error } = await this.db
      .from('ubigeo')
      .select('provincia')
      .eq('departamento', departamento);
    if (error) throw new ErrorBaseDatos(error);
    return unicos(
      (data as { provincia: string }[]).map((u) => u.provincia),
    ).sort(alfabetico);
  }

  async distritos(departamento: string, provincia: string) {
    const { data, error } = await this.db
      .from('ubigeo')
      .select('codigo, distrito')
      .eq('departamento', departamento)
      .eq('provincia', provincia)
      .order('distrito');
    if (error) throw new ErrorBaseDatos(error);
    return (data as { codigo: string; distrito: string }[]).map((u) => ({
      ubigeo: u.codigo,
      distrito: u.distrito,
    }));
  }

  async resolverVehiculo(modeloId: string, anio: number, ubigeo: string) {
    const [modelo, zona] = await Promise.all([
      this.db
        .from('modelo')
        .select(
          'id, nombre, tipo_id, marca_id, tipo_vehiculo(nombre), marca!inner(nombre, activa)',
        )
        .eq('id', modeloId)
        .eq('activo', true)
        .eq('marca.activa', true)
        .maybeSingle(),
      this.db
        .from('ubigeo')
        .select('codigo')
        .eq('codigo', ubigeo)
        .maybeSingle(),
    ]);
    if (modelo.error) throw new ErrorBaseDatos(modelo.error);
    if (zona.error) throw new ErrorBaseDatos(zona.error);
    if (!modelo.data || !zona.data) return null;
    const m = modelo.data as unknown as {
      id: string;
      nombre: string;
      tipo_id: string;
      marca_id: string;
      tipo_vehiculo: Uno<{ nombre: string }>;
      marca: Uno<{ nombre: string }>;
    };
    return {
      marcaId: m.marca_id,
      modeloId: m.id,
      tipoId: m.tipo_id,
      anio,
      ubigeo,
      marca: uno(m.marca)?.nombre ?? '',
      modelo: m.nombre,
      tipo: uno(m.tipo_vehiculo)?.nombre ?? '',
    };
  }
}
