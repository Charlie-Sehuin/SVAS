import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { ErrorBaseDatos } from '../../../common/filters/postgrest-error.filter';
import {
  SUPABASE_SERVICE_CLIENT,
  type SupabaseServiceClient,
} from '../../../infrastructure/database/supabase-service-client.provider';
import { SupabaseUserClientFactory } from '../../../infrastructure/database/supabase-user-client.factory';
import type {
  CanalVenta,
  EstadoPago,
  ModoPago,
  TipoDescuento,
} from '../../../shared/types/enums';
import {
  BUCKET_POLIZAS,
  claveEnBucket,
  type ContenidoCongelado,
  type DatosPolizaPdf,
  type PolizaResumen,
} from '../domain/poliza';
import type {
  PolizaDelUsuario,
  PolizasRepository,
} from '../domain/polizas.repository.port';

type Uno<T> = T | T[] | null;
const uno = <T>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const monto = (v: number | string) => new Decimal(v).toFixed(2);

interface VehiculoDb {
  anio: number;
  placa: string | null;
  modelo: Uno<{ nombre: string; marca: Uno<{ nombre: string }> }>;
}
interface PagoDb {
  modo: ModoPago;
  monto: number | string;
  numero_cuotas: number | null;
  estado: EstadoPago;
  cuota?: {
    numero: number;
    monto: number | string;
    fecha_vencimiento: string;
    estado: EstadoPago;
  }[];
}
interface OrdenDb {
  prima_anual?: number | string;
  descuento_tipo?: TipoDescuento | null;
  descuento_porcentaje?: number | string | null;
  prima_final: number | string;
  contenido_plan: ContenidoCongelado;
  prima_cotizada: Uno<{ suma_asegurada: number | string }>;
  cotizacion: Uno<{
    vehiculo: Uno<
      VehiculoDb & {
        cliente?: Uno<{
          nombres: string;
          apellidos: string;
          numero_documento: string | null;
        }>;
      }
    >;
  }>;
  pago: PagoDb[];
}

// FKs con nombre: orden_compra tiene dos caminos hacia cotización (directo y por la prima).
const ORDEN = (vehiculoExtra: string, pagoExtra: string) => `orden_compra!inner(
  prima_anual, descuento_tipo, descuento_porcentaje, prima_final, contenido_plan,
  prima_cotizada!fk_orden_prima_misma_cotizacion(suma_asegurada),
  cotizacion!orden_compra_cotizacion_id_fkey(
    vehiculo(anio, placa, modelo(nombre, marca(nombre))${vehiculoExtra})),
  pago(modo, monto, numero_cuotas, estado${pagoExtra}))`;

const SELECT_MIAS = `id, numero, fecha_emision, pdf_generado_en, ${ORDEN('', '')}`;
const SELECT_PDF = `id, numero, fecha_emision, canal_venta, archivo_pdf, ${ORDEN(
  ', cliente(nombres, apellidos, numero_documento)',
  ', cuota(numero, monto, fecha_vencimiento, estado)',
)}`;

function vehiculo(v: VehiculoDb | null) {
  const modelo = uno(v?.modelo ?? null);
  return {
    marca: uno(modelo?.marca ?? null)?.nombre ?? '',
    modelo: modelo?.nombre ?? '',
    anio: v?.anio ?? 0,
    placa: v?.placa ?? null,
  };
}

const pagoConfirmado = (pagos: PagoDb[]) =>
  pagos.find((p) => p.estado === 'CONFIRMADO') ?? null;

/** Lecturas con RLS (JWT del cliente) y, para el PDF y el job, service_role. */
@Injectable()
export class PolizasSupabaseRepository implements PolizasRepository {
  constructor(
    private readonly usuarios: SupabaseUserClientFactory,
    @Inject(SUPABASE_SERVICE_CLIENT)
    private readonly servicio: SupabaseServiceClient,
  ) {}

  async mias(accessToken: string): Promise<PolizaResumen[]> {
    const { data, error } = await this.usuarios
      .paraToken(accessToken)
      .from('poliza')
      .select(SELECT_MIAS)
      .order('fecha_emision', { ascending: false });
    if (error) throw new ErrorBaseDatos(error);
    return (
      data as unknown as {
        id: string;
        numero: string;
        fecha_emision: string;
        pdf_generado_en: string | null;
        orden_compra: Uno<OrdenDb>;
      }[]
    ).map((p) => {
      const o = uno(p.orden_compra)!;
      const pago = pagoConfirmado(o.pago ?? []);
      return {
        id: p.id,
        numero: p.numero,
        fechaEmision: p.fecha_emision,
        aseguradora: o.contenido_plan.aseguradora,
        plan: o.contenido_plan.plan,
        vehiculo: vehiculo(uno(uno(o.cotizacion)?.vehiculo ?? null)),
        sumaAsegurada: monto(uno(o.prima_cotizada)?.suma_asegurada ?? 0),
        primaFinal: monto(o.prima_final),
        pago: pago && {
          modo: pago.modo,
          montoTotal: monto(pago.monto),
          numeroCuotas: pago.numero_cuotas,
        },
        pdfDisponible: p.pdf_generado_en !== null,
        contenidoPlan: o.contenido_plan,
      };
    });
  }

  async deUsuario(
    accessToken: string,
    polizaId: string,
  ): Promise<PolizaDelUsuario | null> {
    const { data, error } = await this.usuarios
      .paraToken(accessToken)
      .from('poliza')
      .select('id, numero, archivo_pdf, pdf_generado_en')
      .eq('id', polizaId)
      .maybeSingle();
    if (error) throw new ErrorBaseDatos(error);
    if (!data) return null;
    const p = data as {
      id: string;
      numero: string;
      archivo_pdf: string;
      pdf_generado_en: string | null;
    };
    return {
      id: p.id,
      numero: p.numero,
      archivoPdf: p.archivo_pdf,
      pdfGenerado: p.pdf_generado_en !== null,
    };
  }

  async datosPdf(
    polizaId: string,
  ): Promise<{ archivoPdf: string; datos: DatosPolizaPdf } | null> {
    const { data, error } = await this.servicio
      .from('poliza')
      .select(SELECT_PDF)
      .eq('id', polizaId)
      .maybeSingle();
    if (error) throw new ErrorBaseDatos(error);
    if (!data) return null;
    const p = data as unknown as {
      id: string;
      numero: string;
      fecha_emision: string;
      canal_venta: CanalVenta;
      archivo_pdf: string;
      orden_compra: Uno<OrdenDb>;
    };
    const o = uno(p.orden_compra)!;
    const v = uno(uno(o.cotizacion)?.vehiculo ?? null);
    const cliente = uno(v?.cliente ?? null);
    const pago = pagoConfirmado(o.pago ?? []);
    if (!pago) throw new Error(`La póliza ${p.id} no tiene pago confirmado`);
    return {
      archivoPdf: p.archivo_pdf,
      datos: {
        polizaId: p.id,
        numeroPoliza: p.numero,
        fechaEmision: p.fecha_emision,
        canalVenta: p.canal_venta,
        titular: {
          nombres: cliente?.nombres ?? '',
          apellidos: cliente?.apellidos ?? '',
          numeroDocumento: cliente?.numero_documento ?? null,
        },
        vehiculo: vehiculo(v),
        sumaAsegurada: monto(uno(o.prima_cotizada)?.suma_asegurada ?? 0),
        primaAnual: monto(o.prima_anual ?? o.prima_final),
        descuento:
          o.descuento_tipo && o.descuento_porcentaje != null
            ? {
                tipo: o.descuento_tipo,
                porcentaje: monto(o.descuento_porcentaje),
              }
            : null,
        primaFinal: monto(o.prima_final),
        pago: {
          modo: pago.modo,
          montoTotal: monto(pago.monto),
          numeroCuotas: pago.numero_cuotas,
          cuotas: (pago.cuota ?? [])
            .map((q) => ({
              numero: q.numero,
              monto: monto(q.monto),
              fechaVencimiento: q.fecha_vencimiento,
              estado: q.estado,
            }))
            .sort((a, b) => a.numero - b.numero),
        },
        contenidoPlan: o.contenido_plan,
      },
    };
  }

  async subirPdf(archivoPdf: string, pdf: Buffer): Promise<void> {
    const { error } = await this.servicio.storage
      .from(BUCKET_POLIZAS)
      .upload(claveEnBucket(archivoPdf), pdf, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (error) throw new Error(`No se pudo subir el PDF: ${error.message}`);
  }

  async marcarPdfGenerado(polizaId: string): Promise<void> {
    const { error } = await this.servicio
      .from('poliza')
      .update({ pdf_generado_en: new Date().toISOString() })
      .eq('id', polizaId);
    if (error) throw new ErrorBaseDatos(error);
  }

  async descargarPdf(archivoPdf: string): Promise<Buffer> {
    const { data, error } = await this.servicio.storage
      .from(BUCKET_POLIZAS)
      .download(claveEnBucket(archivoPdf));
    if (error || !data) {
      throw new Error(`No se pudo leer el PDF: ${error?.message ?? 'vacío'}`);
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async pendientes(antesDe: Date, limite: number): Promise<string[]> {
    const { data, error } = await this.servicio
      .from('poliza')
      .select('id')
      .is('pdf_generado_en', null)
      .lt('fecha_emision', antesDe.toISOString())
      .order('fecha_emision')
      .limit(limite);
    if (error) throw new ErrorBaseDatos(error);
    return (data as { id: string }[]).map((p) => p.id);
  }
}
