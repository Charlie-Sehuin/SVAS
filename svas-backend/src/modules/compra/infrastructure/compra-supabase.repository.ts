import { Inject, Injectable } from '@nestjs/common';
import { ErrorBaseDatos } from '../../../common/filters/postgrest-error.filter';
import { aDinero } from '../../../common/utils/money.util';
import { llamarRpc } from '../../../infrastructure/database/rpc.helper';
import {
  SUPABASE_SERVICE_CLIENT,
  type SupabaseServiceClient,
} from '../../../infrastructure/database/supabase-service-client.provider';
import { SupabaseUserClientFactory } from '../../../infrastructure/database/supabase-user-client.factory';
import type { ContenidoCongelado } from '../../polizas/domain/poliza';
import type {
  CanalVenta,
  EstadoCotizacion,
  EstadoPago,
  ModoPago,
  TipoDescuento,
} from '../../../shared/types/enums';
import type {
  CotizacionCompra,
  OrdenCompra,
  PrimaCompra,
} from '../domain/compra';
import type {
  CompraConfirmada,
  CompraRepository,
  NuevaOrden,
  PagoParaRegistrar,
  VistaPreviaDescuento,
} from '../domain/compra.repository.port';

type Uno<T> = T | T[] | null;
const uno = <T>(v: Uno<T> | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
type Num = number | string;

interface AseguradoraDb {
  id: string;
  nombre: string;
  codigo_estrategia: string;
}
interface PlanDb {
  nombre: string;
  aseguradora: Uno<AseguradoraDb>;
}

// orden_compra tiene dos caminos a cotización (directo y por la prima): FKs con nombre.
const SELECT_COTIZACION = `id, estado,
  vehiculo(placa, cliente(numero_documento)),
  orden_compra!orden_compra_cotizacion_id_fkey(id, prima_cotizada_id)`;

const SELECT_ORDEN = `id, cotizacion_id, prima_cotizada_id, prima_anual,
  descuento_tipo, descuento_porcentaje, prima_final, canal_venta, fecha, contenido_plan,
  prima_cotizada!fk_orden_prima_misma_cotizacion(plan_id, suma_asegurada,
    plan(nombre, aseguradora(id, nombre, codigo_estrategia))),
  pago(id, modo, monto, numero_cuotas, estado, referencia, fecha,
    cuota(numero, monto, fecha_vencimiento, estado)),
  poliza!fk_poliza_orden_canal(id, numero, pdf_generado_en)`;

interface OrdenDb {
  id: string;
  cotizacion_id: string;
  prima_cotizada_id: string;
  prima_anual: Num;
  descuento_tipo: TipoDescuento | null;
  descuento_porcentaje: Num | null;
  prima_final: Num;
  canal_venta: CanalVenta;
  fecha: string;
  contenido_plan: ContenidoCongelado;
  prima_cotizada: Uno<{
    plan_id: string;
    suma_asegurada: Num;
    plan: Uno<PlanDb>;
  }>;
  pago: {
    id: string;
    modo: ModoPago;
    monto: Num;
    numero_cuotas: number | null;
    estado: EstadoPago;
    referencia: string;
    fecha: string;
    cuota: {
      numero: number;
      monto: Num;
      fecha_vencimiento: string;
      estado: EstadoPago;
    }[];
  }[];
  poliza: Uno<{ id: string; numero: string; pdf_generado_en: string | null }>;
}

/** Lecturas con RLS (JWT del cliente); escrituras por RPC (0034/0035). */
@Injectable()
export class CompraSupabaseRepository implements CompraRepository {
  constructor(
    private readonly usuarios: SupabaseUserClientFactory,
    @Inject(SUPABASE_SERVICE_CLIENT)
    private readonly servicio: SupabaseServiceClient,
  ) {}

  async cotizacion(
    token: string,
    cotizacionId: string,
  ): Promise<CotizacionCompra | null> {
    const { data, error } = await this.db(token)
      .from('cotizacion')
      .select(SELECT_COTIZACION)
      .eq('id', cotizacionId)
      .maybeSingle();
    if (error) throw new ErrorBaseDatos(error);
    if (!data) return null;
    const c = data as unknown as {
      id: string;
      estado: EstadoCotizacion;
      vehiculo: Uno<{
        placa: string | null;
        cliente: Uno<{ numero_documento: string | null }>;
      }>;
      orden_compra: Uno<{ id: string; prima_cotizada_id: string }>;
    };
    const v = uno(c.vehiculo);
    const o = uno(c.orden_compra);
    return {
      id: c.id,
      estado: c.estado,
      numeroDocumento: uno(v?.cliente)?.numero_documento ?? null,
      placa: v?.placa ?? null,
      orden: o && { id: o.id, primaCotizadaId: o.prima_cotizada_id },
    };
  }

  async prima(
    token: string,
    cotizacionId: string,
    primaCotizadaId: string,
  ): Promise<PrimaCompra | null> {
    const { data, error } = await this.db(token)
      .from('prima_cotizada')
      .select(
        'id, plan_id, suma_asegurada, prima, disponible, plan(nombre, aseguradora(id, nombre, codigo_estrategia))',
      )
      .eq('id', primaCotizadaId)
      .eq('cotizacion_id', cotizacionId)
      .maybeSingle();
    if (error) throw new ErrorBaseDatos(error);
    if (!data) return null;
    const p = data as unknown as {
      id: string;
      plan_id: string;
      suma_asegurada: Num | null;
      prima: Num | null;
      disponible: boolean;
      plan: Uno<PlanDb>;
    };
    // RLS oculta planes y aseguradoras inactivos: entonces no se puede comprar.
    const plan = uno(p.plan);
    const aseguradora = uno(plan?.aseguradora);
    return {
      primaCotizadaId: p.id,
      planId: p.plan_id,
      plan: plan?.nombre ?? '',
      aseguradoraId: aseguradora?.id ?? '',
      aseguradora: aseguradora?.nombre ?? '',
      codigoEstrategia: aseguradora?.codigo_estrategia ?? '',
      sumaAsegurada: aDinero(p.suma_asegurada ?? 0),
      prima: aDinero(p.prima ?? 0),
      disponible: p.disponible && p.prima !== null && aseguradora !== null,
    };
  }

  async vistaPreviaDescuento(
    token: string,
    cotizacionId: string,
    primaCotizadaId: string,
  ): Promise<VistaPreviaDescuento | null> {
    const r = await llamarRpc<{
      tipo: TipoDescuento;
      porcentaje: string;
      provisional: boolean;
    } | null>(this.db(token), 'vista_previa_descuento', {
      p_cotizacion_id: cotizacionId,
      p_prima_cotizada_id: primaCotizadaId,
    });
    return (
      r && {
        tipo: r.tipo,
        porcentaje: aDinero(r.porcentaje),
        provisional: r.provisional,
      }
    );
  }

  async maxCuotas(): Promise<number> {
    const { data, error } = await this.servicio
      .from('parametros_comerciales')
      .select('max_cuotas')
      .eq('id', 1)
      .single();
    if (error) throw new ErrorBaseDatos(error);
    return (data as { max_cuotas: number }).max_cuotas;
  }

  async completarDatos(
    token: string,
    cotizacionId: string,
    datos: { numeroDocumento?: string; placa?: string },
  ) {
    const r = await llamarRpc<{
      numero_documento: string | null;
      placa: string | null;
    }>(this.db(token), 'completar_datos_compra', {
      p_cotizacion_id: cotizacionId,
      p_numero_documento: datos.numeroDocumento ?? null,
      p_placa: datos.placa ?? null,
    });
    return { numeroDocumento: r.numero_documento, placa: r.placa };
  }

  async crearOrden(token: string, o: NuevaOrden): Promise<string> {
    const r = await llamarRpc<{ id: string }>(
      this.db(token),
      'crear_orden_compra',
      {
        p_cotizacion_id: o.cotizacionId,
        p_prima_cotizada_id: o.primaCotizadaId,
        p_origen: o.origen,
        // Los datos faltantes se guardan antes con PUT /datos (completar_datos_compra).
        p_datos_faltantes: null,
        p_contenido_plan: o.contenidoPlan,
        p_acepta_condiciones: o.aceptaCondiciones,
        p_firma_simulada: o.firmaSimulada,
      },
    );
    return r.id;
  }

  async orden(token: string, ordenId: string): Promise<OrdenCompra | null> {
    const { data, error } = await this.db(token)
      .from('orden_compra')
      .select(SELECT_ORDEN)
      .eq('id', ordenId)
      .maybeSingle();
    if (error) throw new ErrorBaseDatos(error);
    if (!data) return null;
    const o = data as unknown as OrdenDb;
    const pc = uno(o.prima_cotizada);
    const aseguradora = uno(uno(pc?.plan)?.aseguradora);
    const poliza = uno(o.poliza);
    return {
      id: o.id,
      cotizacionId: o.cotizacion_id,
      primaCotizadaId: o.prima_cotizada_id,
      planId: pc?.plan_id ?? o.contenido_plan.planId,
      sumaAsegurada: aDinero(pc?.suma_asegurada ?? 0),
      primaAnual: aDinero(o.prima_anual),
      descuento:
        o.descuento_tipo && o.descuento_porcentaje !== null
          ? {
              tipo: o.descuento_tipo,
              porcentaje: aDinero(o.descuento_porcentaje),
            }
          : null,
      primaFinal: aDinero(o.prima_final),
      canalVenta: o.canal_venta,
      fecha: o.fecha,
      contenidoPlan: o.contenido_plan,
      tarifa: aseguradora && {
        aseguradoraId: aseguradora.id,
        codigoEstrategia: aseguradora.codigo_estrategia,
      },
      pagos: (o.pago ?? [])
        .map((p) => ({
          id: p.id,
          modo: p.modo,
          monto: aDinero(p.monto),
          numeroCuotas: p.numero_cuotas,
          estado: p.estado,
          referencia: p.referencia,
          fecha: p.fecha,
          cuotas: (p.cuota ?? [])
            .map((c) => ({
              numero: c.numero,
              monto: aDinero(c.monto),
              fechaVencimiento: c.fecha_vencimiento,
              estado: c.estado,
            }))
            .sort((a, b) => a.numero - b.numero),
        }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
      poliza: poliza && {
        id: poliza.id,
        numero: poliza.numero,
        pdfDisponible: poliza.pdf_generado_en !== null,
      },
    };
  }

  async registrarRechazo(token: string, p: PagoParaRegistrar): Promise<void> {
    await llamarRpc(this.db(token), 'registrar_pago_rechazado', {
      p_orden_id: p.ordenId,
      p_modo: p.modo,
      p_numero_cuotas: p.numeroCuotas,
      p_referencia: p.referencia,
      p_monto_total: p.montoTotal.toFixed(2),
    });
  }

  async confirmar(
    token: string,
    p: PagoParaRegistrar & { numeroPoliza: string },
  ): Promise<CompraConfirmada> {
    const r = await llamarRpc<{
      poliza_id: string;
      numero_poliza: string;
      pago_id: string;
    }>(this.db(token), 'confirmar_compra', {
      p_orden_id: p.ordenId,
      p_modo: p.modo,
      p_numero_cuotas: p.numeroCuotas,
      p_referencia: p.referencia,
      p_numero_poliza: p.numeroPoliza,
      p_monto_total: p.montoTotal.toFixed(2),
    });
    return {
      polizaId: r.poliza_id,
      numeroPoliza: r.numero_poliza,
      pagoId: r.pago_id,
    };
  }

  private db(token: string) {
    return this.usuarios.paraToken(token);
  }
}
