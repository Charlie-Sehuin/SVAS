import { aJson } from '../../../common/utils/money.util';
import type { OrdenCompra, PagoOrden } from '../domain/compra';

const cuotasJson = (p: PagoOrden) =>
  p.cuotas.map((c) => ({
    numero: c.numero,
    monto: aJson(c.monto),
    fechaVencimiento: c.fechaVencimiento,
    estado: c.estado,
  }));

export const pagoConfirmado = (o: OrdenCompra) =>
  o.pagos.find((p) => p.estado === 'CONFIRMADO') ?? null;

/** GET /compras/:id/estado y respuesta de POST /compras (doc conexión §6 "Compra"). */
export function vistaOrden(o: OrdenCompra) {
  const pago = pagoConfirmado(o);
  return {
    ordenId: o.id,
    cotizacionId: o.cotizacionId,
    primaCotizadaId: o.primaCotizadaId,
    estado: o.poliza ? ('CONFIRMADO' as const) : ('PENDIENTE_PAGO' as const),
    aseguradora: o.contenidoPlan.aseguradora,
    plan: o.contenidoPlan.plan,
    sumaAsegurada: aJson(o.sumaAsegurada),
    primaAnual: aJson(o.primaAnual),
    descuento: o.descuento && {
      tipo: o.descuento.tipo,
      porcentaje: aJson(o.descuento.porcentaje),
    },
    primaFinal: aJson(o.primaFinal),
    canalVenta: o.canalVenta,
    fecha: o.fecha,
    pago: pago && {
      modo: pago.modo,
      montoTotal: aJson(pago.monto),
      numeroCuotas: pago.numeroCuotas,
      cuotas: cuotasJson(pago),
    },
    pagosRechazados: o.pagos.filter((p) => p.estado === 'RECHAZADO').length,
    poliza: o.poliza,
    // RN-45: lo que el cliente contrató, tal como se congeló.
    contenidoPlan: o.contenidoPlan,
  };
}

/** Respuesta de POST /compras/:id/pago (arquitectura backend §6, paso 9). */
export function vistaCompraPagada(o: OrdenCompra, pago: PagoOrden) {
  return {
    estado: 'CONFIRMADO' as const,
    ordenId: o.id,
    polizaId: o.poliza?.id ?? null,
    numeroPoliza: o.poliza?.numero ?? null,
    montoTotal: aJson(pago.monto),
    modo: pago.modo,
    numeroCuotas: pago.numeroCuotas,
    cuotas: cuotasJson(pago),
  };
}
