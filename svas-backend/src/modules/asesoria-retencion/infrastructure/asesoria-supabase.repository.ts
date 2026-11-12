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
  CanalContacto,
  EstadoCotizacion,
  EstadoSeguimiento,
  EstadoSolicitud,
  MotivoAsesoria,
  MotivoCierre,
  OrigenCaso,
  ResultadoIntento,
  TipoDescuento,
} from '../../../shared/types/enums';
import type {
  AsesoriaRepository,
  AvisoCliente,
  CierreSeguimiento,
  ContactoDelCaso,
  CotizacionDelCaso,
  DescuentoDelCaso,
  PrimaDelCaso,
  Seguimiento,
  SeguimientoDetalle,
  Solicitud,
  SolicitudDetalle,
} from '../domain/asesoria.repository.port';

type Uno<T> = T | T[] | null;
const uno = <T>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const monto = (v: number | string | null) =>
  v === null ? null : new Decimal(v).toFixed(2);

// ── Selects (columnas explícitas: seguimiento.enlace_token no se puede leer) ──
const cotizacion = (extra = '') => `cotizacion!inner(
  id, fecha, estado,
  vehiculo!inner(anio, modelo(nombre, marca(nombre)),
    cliente!inner(nombres, apellidos, telefono, email, canal_preferido, numero_documento))${extra})`;
const COTIZACION = cotizacion();
const COTIZACION_DETALLE = cotizacion(`,
  prima_cotizada(plan_id, disponible, suma_asegurada, prima, prima_mensual, plan(nombre, aseguradora(nombre))),
  descuento(id, plan_id, tipo, porcentaje, aceptado, fecha)`);
const SOLICITUD =
  'id, motivo, estado, canal, origen, fecha_creacion, asesor_id, resultado';
const SEGUIMIENTO =
  'id, estado, intentos, fecha_apertura, fecha_cierre, motivo_cierre';

interface FilaCotizacion {
  id: string;
  fecha: string;
  estado: EstadoCotizacion;
  vehiculo: Uno<{
    anio: number;
    modelo: Uno<{ nombre: string; marca: Uno<{ nombre: string }> }>;
    cliente: Uno<{
      nombres: string;
      apellidos: string;
      telefono: string;
      email: string;
      canal_preferido: CanalContacto;
      numero_documento: string | null;
    }>;
  }>;
  prima_cotizada?: {
    plan_id: string;
    disponible: boolean;
    suma_asegurada: number | null;
    prima: number | null;
    prima_mensual: number | null;
    plan: Uno<{ nombre: string; aseguradora: Uno<{ nombre: string }> }>;
  }[];
  descuento?: FilaDescuento[];
}

interface FilaDescuento {
  id: string;
  plan_id: string;
  tipo: TipoDescuento;
  porcentaje: number | string;
  aceptado: boolean;
  fecha: string;
}

interface FilaSolicitud {
  id: string;
  motivo: MotivoAsesoria;
  estado: EstadoSolicitud;
  canal: CanalContacto;
  origen: OrigenCaso;
  fecha_creacion: string;
  asesor_id: string | null;
  resultado: string | null;
  cotizacion: Uno<FilaCotizacion>;
}

interface FilaSeguimiento {
  id: string;
  estado: EstadoSeguimiento;
  intentos: number;
  fecha_apertura: string;
  fecha_cierre: string | null;
  motivo_cierre: MotivoCierre | null;
  cotizacion: Uno<FilaCotizacion>;
  intento_contacto?: {
    id: string;
    canal: CanalContacto;
    resultado: ResultadoIntento;
    fecha: string;
    asesor_id: string;
  }[];
}

/** Lo que devuelven los RPC que avisan al cliente (_contacto_seguimiento + extras). */
interface FilaAviso {
  seguimiento_id: string;
  cotizacion_id: string;
  nombres: string;
  canal: CanalContacto;
  telefono: string;
  enlace_token: string | null;
  estado?: EstadoSeguimiento;
  motivo?: MotivoCierre | null;
}

function aCotizacion(f: Uno<FilaCotizacion>): {
  cotizacion: CotizacionDelCaso;
  cliente: ContactoDelCaso;
} {
  const c = uno(f);
  const v = uno(c?.vehiculo ?? null);
  const m = uno(v?.modelo ?? null);
  const cl = uno(v?.cliente ?? null);
  if (!c || !v || !cl) {
    // Con !inner no debería pasar; si pasa, es un error del select, no del usuario.
    throw new ErrorBaseDatos({ message: 'Caso sin cotización o sin cliente' });
  }
  return {
    cotizacion: {
      id: c.id,
      fecha: c.fecha,
      estado: c.estado,
      vehiculo: [uno(m?.marca ?? null)?.nombre, m?.nombre, v.anio]
        .filter(Boolean)
        .join(' '),
    },
    cliente: {
      nombres: cl.nombres,
      apellidos: cl.apellidos,
      telefono: cl.telefono,
      email: cl.email,
      canalPreferido: cl.canal_preferido,
      numeroDocumento: cl.numero_documento,
    },
  };
}

const aDescuento = (d: FilaDescuento): DescuentoDelCaso => ({
  id: d.id,
  planId: d.plan_id,
  tipo: d.tipo,
  porcentaje: new Decimal(d.porcentaje).toFixed(2),
  aceptado: d.aceptado,
  fecha: d.fecha,
});

function primasYDescuentos(f: Uno<FilaCotizacion>): {
  primas: PrimaDelCaso[];
  descuentos: DescuentoDelCaso[];
} {
  const c = uno(f);
  return {
    primas: (c?.prima_cotizada ?? []).map((p) => {
      const plan = uno(p.plan);
      return {
        planId: p.plan_id,
        plan: plan?.nombre ?? '',
        aseguradora: uno(plan?.aseguradora ?? null)?.nombre ?? '',
        disponible: p.disponible,
        sumaAsegurada: monto(p.suma_asegurada),
        prima: monto(p.prima),
        primaMensual: monto(p.prima_mensual),
      };
    }),
    descuentos: (c?.descuento ?? [])
      .map(aDescuento)
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}

const aSolicitud = (f: FilaSolicitud): Solicitud => ({
  id: f.id,
  motivo: f.motivo,
  estado: f.estado,
  canal: f.canal,
  origen: f.origen,
  fechaCreacion: f.fecha_creacion,
  asesorId: f.asesor_id,
  resultado: f.resultado,
  ...aCotizacion(f.cotizacion),
});

const aSeguimiento = (f: FilaSeguimiento): Seguimiento => ({
  id: f.id,
  estado: f.estado,
  intentos: f.intentos,
  fechaApertura: f.fecha_apertura,
  fechaCierre: f.fecha_cierre,
  motivoCierre: f.motivo_cierre,
  ...aCotizacion(f.cotizacion),
});

const aAviso = (f: FilaAviso): AvisoCliente => ({
  seguimientoId: f.seguimiento_id,
  cotizacionId: f.cotizacion_id,
  nombres: f.nombres,
  canal: f.canal,
  telefono: f.telefono,
  enlaceToken: f.enlace_token,
});

const aCierre = (f: FilaAviso): CierreSeguimiento => ({
  ...aAviso(f),
  estado: f.estado ?? 'DESCARTADO',
  motivo: f.motivo ?? null,
});

@Injectable()
export class AsesoriaSupabaseRepository implements AsesoriaRepository {
  constructor(
    @Inject(SUPABASE_SERVICE_CLIENT)
    private readonly servicio: SupabaseServiceClient,
    private readonly clientes: SupabaseUserClientFactory,
  ) {}

  private como(accessToken: string) {
    return this.clientes.paraToken(accessToken);
  }

  // ── Asesoría ──────────────────────────────────────────────────────────────
  async solicitar(
    accessToken: string,
    d: { cotizacionId: string; motivo: MotivoAsesoria; canal: CanalContacto },
  ) {
    const f = await llamarRpc<FilaSolicitud>(
      this.como(accessToken),
      'solicitar_asesoria',
      {
        p_cotizacion_id: d.cotizacionId,
        p_motivo: d.motivo,
        p_canal: d.canal,
      },
    );
    return {
      id: f.id,
      motivo: f.motivo,
      estado: f.estado,
      canal: f.canal,
      origen: f.origen,
      fechaCreacion: f.fecha_creacion,
    };
  }

  async listarCola(
    accessToken: string,
    f: { estado?: EstadoSolicitud; origen?: OrigenCaso },
  ): Promise<Solicitud[]> {
    let q = this.como(accessToken)
      .from('solicitud_asesoria')
      .select(`${SOLICITUD}, ${COTIZACION}`);
    q = f.estado ? q.eq('estado', f.estado) : q.neq('estado', 'CERRADA');
    if (f.origen) q = q.eq('origen', f.origen);
    // RN-13: el enum ordena SISTEMA antes que CLIENTE.
    const { data, error } = await q
      .order('origen', { ascending: true })
      .order('fecha_creacion', { ascending: true })
      .limit(200);
    if (error) throw new ErrorBaseDatos(error);
    return (data as unknown as FilaSolicitud[]).map(aSolicitud);
  }

  async obtenerSolicitud(
    accessToken: string,
    id: string,
  ): Promise<SolicitudDetalle | null> {
    const { data, error } = await this.como(accessToken)
      .from('solicitud_asesoria')
      .select(`${SOLICITUD}, ${COTIZACION_DETALLE}`)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new ErrorBaseDatos(error);
    if (!data) return null;
    const f = data as unknown as FilaSolicitud;
    return { ...aSolicitud(f), ...primasYDescuentos(f.cotizacion) };
  }

  async tomar(accessToken: string, id: string) {
    const f = await llamarRpc<FilaSolicitud>(
      this.como(accessToken),
      'tomar_solicitud',
      {
        p_solicitud_id: id,
      },
    );
    return { id: f.id, estado: f.estado };
  }

  async aplicarDescuento(
    accessToken: string,
    id: string,
    planId: string,
    porcentaje: string,
  ) {
    const f = await llamarRpc<FilaDescuento>(
      this.como(accessToken),
      'aplicar_descuento_negociado',
      { p_solicitud_id: id, p_plan_id: planId, p_porcentaje: porcentaje },
    );
    return aDescuento(f);
  }

  async cerrarSolicitud(
    accessToken: string,
    id: string,
    resultado: string,
    acepta: boolean,
  ) {
    const f = await llamarRpc<FilaSolicitud & { acepta: boolean }>(
      this.como(accessToken),
      'cerrar_solicitud',
      { p_solicitud_id: id, p_resultado: resultado, p_acepta: acepta },
    );
    return {
      id: f.id,
      estado: f.estado,
      resultado: f.resultado ?? resultado,
      acepta: f.acepta,
    };
  }

  // ── Seguimiento ───────────────────────────────────────────────────────────
  async listarSeguimientos(
    accessToken: string,
    estado: EstadoSeguimiento = 'EN_SEGUIMIENTO',
  ): Promise<Seguimiento[]> {
    const { data, error } = await this.como(accessToken)
      .from('seguimiento')
      .select(`${SEGUIMIENTO}, ${COTIZACION}`)
      .eq('estado', estado)
      .order('fecha_apertura', { ascending: estado === 'EN_SEGUIMIENTO' })
      .limit(200);
    if (error) throw new ErrorBaseDatos(error);
    return (data as unknown as FilaSeguimiento[]).map(aSeguimiento);
  }

  async obtenerSeguimiento(
    accessToken: string,
    id: string,
  ): Promise<SeguimientoDetalle | null> {
    const { data, error } = await this.como(accessToken)
      .from('seguimiento')
      .select(
        `${SEGUIMIENTO}, intento_contacto(id, canal, resultado, fecha, asesor_id), ${COTIZACION_DETALLE}`,
      )
      .eq('id', id)
      .maybeSingle();
    if (error) throw new ErrorBaseDatos(error);
    if (!data) return null;
    const f = data as unknown as FilaSeguimiento;
    return {
      ...aSeguimiento(f),
      historial: (f.intento_contacto ?? [])
        .map((i) => ({
          id: i.id,
          canal: i.canal,
          resultado: i.resultado,
          fecha: i.fecha,
          asesorId: i.asesor_id,
        }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
      ...primasYDescuentos(f.cotizacion),
    };
  }

  async registrarIntento(
    accessToken: string,
    id: string,
    canal: CanalContacto,
    resultado: ResultadoIntento,
  ) {
    const r = await llamarRpc<{
      intentos: number;
      max_intentos: number;
      cierre: FilaAviso | null;
    }>(this.como(accessToken), 'registrar_intento_contacto', {
      p_seguimiento_id: id,
      p_canal: canal,
      p_resultado: resultado,
    });
    return {
      intentos: r.intentos,
      maxIntentos: r.max_intentos,
      cierre: r.cierre ? aCierre(r.cierre) : null,
    };
  }

  async enviarEnlaceCompra(
    accessToken: string,
    id: string,
  ): Promise<AvisoCliente> {
    return aAviso(
      await llamarRpc<FilaAviso>(
        this.como(accessToken),
        'enviar_enlace_compra',
        {
          p_seguimiento_id: id,
        },
      ),
    );
  }

  async cerrarSeguimiento(
    accessToken: string,
    id: string,
    estado: EstadoSeguimiento,
    motivo: MotivoCierre | null,
  ): Promise<CierreSeguimiento> {
    return aCierre(
      await llamarRpc<FilaAviso>(this.como(accessToken), 'cerrar_seguimiento', {
        p_seguimiento_id: id,
        p_estado: estado,
        p_motivo: motivo,
      }),
    );
  }

  async parametros(accessToken: string) {
    const { data, error } = await this.como(accessToken)
      .from('parametros_comerciales')
      .select('descuento_maximo, max_intentos, dias_seguimiento')
      .eq('id', 1)
      .single();
    if (error) throw new ErrorBaseDatos(error);
    const f = data as {
      descuento_maximo: number;
      max_intentos: number;
      dias_seguimiento: number;
    };
    return {
      descuentoMaximo: new Decimal(f.descuento_maximo).toFixed(2),
      maxIntentos: f.max_intentos,
      diasSeguimiento: f.dias_seguimiento,
    };
  }

  // ── Sistema (service_role) ────────────────────────────────────────────────
  detectarAbandonadas(): Promise<number> {
    return llamarRpc<number>(
      this.servicio,
      'detectar_cotizaciones_abandonadas',
      {},
    );
  }

  async caducarSeguimientos(): Promise<CierreSeguimiento[]> {
    const r = await llamarRpc<FilaAviso[]>(
      this.servicio,
      'caducar_seguimientos',
      {},
    );
    return r.map(aCierre);
  }

  async resolverRetoma(tokenHash: string, nuevoTokenHash: string) {
    const r = await llamarRpc<{
      cotizacion_id: string;
      descuento: { tipo: TipoDescuento; porcentaje: string };
    }>(this.servicio, 'resolver_enlace_retoma', {
      p_token_hash: tokenHash,
      p_nuevo_token_hash: nuevoTokenHash,
    });
    return {
      cotizacionId: r.cotizacion_id,
      descuento: {
        tipo: r.descuento.tipo,
        porcentaje: new Decimal(r.descuento.porcentaje).toFixed(2),
      },
    };
  }
}
