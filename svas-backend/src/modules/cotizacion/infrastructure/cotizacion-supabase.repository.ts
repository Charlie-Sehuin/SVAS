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
  EstadoCotizacion,
  MotivoAsesoria,
  OpcionVenta,
  UsoVehiculo,
} from '../../../shared/types/enums';
import type {
  CotizacionDeLista,
  CotizacionGuardada,
  CotizacionRegistrada,
  CotizacionRepository,
  NuevaCotizacion,
} from '../domain/cotizacion.repository.port';
import type { ResultadoPlan } from '../domain/tarifa.types';

type Uno<T> = T | T[] | null;
const uno = <T>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const dec = (v: number | string | null) => (v === null ? null : new Decimal(v));
const monto = (d: Decimal | undefined) => (d ? d.toFixed(2) : null);

/** ResultadoPlan → fila de prima para los RPC (montos como string, nunca float). */
function aPrimaRpc(p: ResultadoPlan) {
  return {
    plan_id: p.planId,
    disponible: p.disponible,
    suma_asegurada: monto(p.sumaAsegurada),
    prima: monto(p.prima),
    prima_mensual: monto(p.primaMensual),
    detalle_calculo: p.detalleCalculo ?? null, // Decimal.toJSON → string
    motivo_no_disponible: p.motivoNoDisponible ?? null,
  };
}

const SELECT_COTIZACION = `
  id, fecha, estado, motivo_derivacion, token_acceso_hash,
  cotizacion_opcion(opcion),
  vehiculo!inner(
    uso, anio, placa, clase,
    modelo!inner(id, nombre, tipo_id, marca_id, marca(nombre), tipo_vehiculo(nombre)),
    ubicacion_uso(u:ubigeo(codigo, distrito))
  ),
  prima_cotizada(
    id, plan_id, suma_asegurada, prima, prima_mensual, detalle_calculo,
    motivo_no_disponible, disponible,
    plan(nombre, aseguradora_id, aseguradora(nombre))
  )`;

interface FilaCotizacion {
  id: string;
  fecha: string;
  estado: EstadoCotizacion;
  motivo_derivacion: MotivoAsesoria | null;
  token_acceso_hash: string;
  cotizacion_opcion: { opcion: OpcionVenta }[];
  vehiculo: Uno<{
    uso: UsoVehiculo;
    anio: number;
    placa: string | null;
    clase: string | null;
    modelo: Uno<{
      id: string;
      nombre: string;
      tipo_id: string;
      marca_id: string;
      marca: Uno<{ nombre: string }>;
      tipo_vehiculo: Uno<{ nombre: string }>;
    }>;
    ubicacion_uso: Uno<{ u: Uno<{ codigo: string; distrito: string }> }>;
  }>;
  prima_cotizada: {
    id: string;
    plan_id: string;
    suma_asegurada: number | null;
    prima: number | null;
    prima_mensual: number | null;
    detalle_calculo: Record<string, unknown> | null;
    motivo_no_disponible: string | null;
    disponible: boolean;
    plan: Uno<{
      nombre: string;
      aseguradora_id: string;
      aseguradora: Uno<{ nombre: string }>;
    }>;
  }[];
}

const ORDEN_OPCION: OpcionVenta[] = ['COMPRA_INMEDIATA', 'ASESORIA'];

@Injectable()
export class CotizacionSupabaseRepository implements CotizacionRepository {
  constructor(
    @Inject(SUPABASE_SERVICE_CLIENT)
    private readonly servicio: SupabaseServiceClient,
    private readonly clientes: SupabaseUserClientFactory,
  ) {}

  async registrar(c: NuevaCotizacion): Promise<CotizacionRegistrada> {
    const r = await llamarRpc<{
      cotizacion_id: string;
      fecha: string;
      primas: { id: string; plan_id: string }[];
    }>(this.servicio, 'registrar_cotizacion', {
      p_payload: {
        contacto: {
          nombres: c.contacto.nombres,
          apellidos: c.contacto.apellidos,
          telefono: c.contacto.telefono,
          email: c.contacto.email,
          canal_preferido: c.contacto.canalPreferido,
        },
        vehiculo: {
          uso: c.vehiculo.uso,
          modelo_id: c.vehiculo.modeloId,
          anio: c.vehiculo.anio,
          clase: c.vehiculo.clase ?? null,
          placa: c.vehiculo.placa ?? null,
          ubigeo: c.vehiculo.ubigeo,
        },
        token_acceso_hash: c.tokenHash,
        opciones: c.opciones,
        motivo_derivacion: c.motivoDerivacion,
        primas: c.primas.map(aPrimaRpc),
      },
    });
    return {
      cotizacionId: r.cotizacion_id,
      fecha: r.fecha,
      primas: r.primas.map((p) => ({ id: p.id, planId: p.plan_id })),
    };
  }

  async obtener(id: string): Promise<CotizacionGuardada | null> {
    const { data, error } = await this.servicio
      .from('cotizacion')
      .select(SELECT_COTIZACION)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new ErrorBaseDatos(error);
    if (!data) return null;

    const f = data as unknown as FilaCotizacion;
    const v = uno(f.vehiculo);
    const m = uno(v?.modelo ?? null);
    const u = uno(uno(v?.ubicacion_uso ?? null)?.u ?? null);
    if (!v || !m || !u) return null;

    return {
      id: f.id,
      fecha: f.fecha,
      estado: f.estado,
      motivoDerivacion: f.motivo_derivacion,
      opciones: f.cotizacion_opcion
        .map((o) => o.opcion)
        .sort((a, b) => ORDEN_OPCION.indexOf(a) - ORDEN_OPCION.indexOf(b)),
      tokenHash: f.token_acceso_hash,
      vehiculo: {
        uso: v.uso,
        marcaId: m.marca_id,
        marca: uno(m.marca)?.nombre ?? '',
        modeloId: m.id,
        modelo: m.nombre,
        tipoId: m.tipo_id,
        tipo: uno(m.tipo_vehiculo)?.nombre ?? '',
        anio: v.anio,
        ubigeo: u.codigo,
        distrito: u.distrito,
        placa: v.placa,
        clase: v.clase,
      },
      primas: f.prima_cotizada.map((p) => {
        const plan = uno(p.plan);
        return {
          id: p.id,
          planId: p.plan_id,
          plan: plan?.nombre ?? '',
          aseguradoraId: plan?.aseguradora_id ?? '',
          aseguradora: uno(plan?.aseguradora ?? null)?.nombre ?? '',
          disponible: p.disponible,
          motivoNoDisponible: p.motivo_no_disponible,
          sumaAsegurada: dec(p.suma_asegurada),
          prima: dec(p.prima),
          primaMensual: dec(p.prima_mensual),
          detalleCalculo: p.detalle_calculo,
        };
      }),
    };
  }

  async obtenerAcceso(id: string) {
    const { data, error } = await this.servicio
      .from('cotizacion')
      .select('token_acceso_hash, estado')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new ErrorBaseDatos(error);
    if (!data) return null;
    const f = data as { token_acceso_hash: string; estado: EstadoCotizacion };
    return { tokenHash: f.token_acceso_hash, estado: f.estado };
  }

  async esVisiblePara(accessToken: string, id: string): Promise<boolean> {
    const { data, error } = await this.clientes
      .paraToken(accessToken)
      .from('cotizacion')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new ErrorBaseDatos(error);
    return data !== null;
  }

  async actualizarSuma(
    cotizacionId: string,
    aseguradoraId: string,
    primas: ResultadoPlan[],
    accessToken?: string,
  ): Promise<{ simulacionesInvalidadas: number }> {
    const cliente = accessToken
      ? this.clientes.paraToken(accessToken)
      : this.servicio;
    const r = await llamarRpc<{ simulaciones_invalidadas: number }>(
      cliente,
      'actualizar_suma_asegurada',
      {
        p_cotizacion_id: cotizacionId,
        p_aseguradora_id: aseguradoraId,
        p_primas: primas.map(aPrimaRpc),
      },
    );
    return { simulacionesInvalidadas: r.simulaciones_invalidadas };
  }

  async vincularCliente(d: {
    usuarioId: string;
    cotizacionId: string;
    tokenHash: string | null;
    contacto: {
      nombres?: string;
      apellidos?: string;
      telefono?: string;
      canalPreferido?: string;
    };
  }): Promise<{ clienteId: string }> {
    const r = await llamarRpc<{ cliente_id: string }>(
      this.servicio,
      'vincular_cliente',
      {
        p_usuario_id: d.usuarioId,
        p_contacto: {
          nombres: d.contacto.nombres ?? null,
          apellidos: d.contacto.apellidos ?? null,
          telefono: d.contacto.telefono ?? null,
          canal_preferido: d.contacto.canalPreferido ?? null,
        },
        p_cotizacion_id: d.cotizacionId,
        p_token_hash: d.tokenHash,
      },
    );
    return { clienteId: r.cliente_id };
  }

  async listarMias(accessToken: string): Promise<CotizacionDeLista[]> {
    const { data, error } = await this.clientes
      .paraToken(accessToken)
      .from('cotizacion')
      .select(
        'id, fecha, estado, vehiculo(anio, modelo(nombre, marca(nombre))), prima_cotizada(prima_mensual, disponible)',
      )
      .order('fecha', { ascending: false });
    if (error) throw new ErrorBaseDatos(error);

    type Fila = {
      id: string;
      fecha: string;
      estado: EstadoCotizacion;
      vehiculo: Uno<{
        anio: number;
        modelo: Uno<{ nombre: string; marca: Uno<{ nombre: string }> }>;
      }>;
      prima_cotizada: { prima_mensual: number | null; disponible: boolean }[];
    };
    return (data as unknown as Fila[]).map((f) => {
      const v = uno(f.vehiculo);
      const m = uno(v?.modelo ?? null);
      const mensuales = f.prima_cotizada
        .filter((p) => p.disponible && p.prima_mensual !== null)
        .map((p) => new Decimal(p.prima_mensual!));
      return {
        id: f.id,
        fecha: f.fecha,
        estado: f.estado,
        marca: uno(m?.marca ?? null)?.nombre ?? '',
        modelo: m?.nombre ?? '',
        anio: v?.anio ?? 0,
        primaMensualDesde: mensuales.length ? Decimal.min(...mensuales) : null,
      };
    });
  }

  async contarAsegurados(
    email: string,
    telefono: string,
  ): Promise<{ particular: number; comercial: number }> {
    const { data, error } = await this.servicio
      .from('cotizacion')
      .select('id, vehiculo!inner(uso, cliente!inner(email, telefono))')
      .eq('estado', 'CONVERTIDA')
      .eq('vehiculo.cliente.email', email.toLowerCase())
      .eq('vehiculo.cliente.telefono', telefono);
    if (error) throw new ErrorBaseDatos(error);

    const usos = (
      data as unknown as { vehiculo: Uno<{ uso: UsoVehiculo }> }[]
    ).map((f) => uno(f.vehiculo)?.uso);
    return {
      particular: usos.filter((u) => u === 'PARTICULAR').length,
      comercial: usos.filter((u) => u && u !== 'PARTICULAR').length,
    };
  }
}
