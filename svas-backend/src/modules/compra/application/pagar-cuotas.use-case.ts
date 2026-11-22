import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hoyEnLima } from '../../../common/utils/fecha.util';
import { aJson, sumar } from '../../../common/utils/money.util';
import { aCuotasResumen } from '../../polizas/domain/cuotas';
import { ProcesarPagoService } from '../../pagos/application/procesar-pago.service';
import {
  COMPRA_REPOSITORY,
  type CompraRepository,
  type CuotasPagadas,
} from '../domain/compra.repository.port';
import { COMPRA_NO_EXISTE } from './compra.service';
import { PAGO_RECHAZADO } from './pagar-y-emitir.use-case';
import { pagoConfirmado } from './vista-orden';

export const COMPRA_SIN_CUOTAS =
  'Esta compra se pagó al contado: no tiene cuotas por pagar';
export const COMPRA_SIN_PAGAR = 'Esta compra aún no está pagada';
export const CUOTAS_AL_DIA = 'Ya pagaste todas las cuotas';

export interface SolicitudPagarCuotas {
  ordenId: string;
  /** Cuántas cuotas pagar: las SIGUIENTES pendientes, en orden. 1 = la próxima; todas = las que queden. */
  cantidad: number;
  idempotencyKey: string;
}

/**
 * POST /compras/:id/cuotas/pago (Fase B del panel del cliente).
 *
 * 1. Lee la orden como el cliente (RLS: si es ajena, 404). Si alguna cuota ya se pagó con esta misma Idempotency-Key,
 *    es un reintento: responde lo mismo SIN cobrar.
 * 2. Elige las primeras N cuotas PENDIENTES por número (nunca se paga la 5 con la 3 pendiente), las suma en el
 *    backend y cobra en la pasarela.
 * 3. Si se aprueba, el RPC `pagar_cuotas` las marca; si el monto no coincide con la base, lo rechaza.
 *
 * Una cuota vencida se puede pagar igual: no hay recargo ni bloqueo, solo aviso (decisión 2026-11-22).
 */
@Injectable()
export class PagarCuotasUseCase {
  constructor(
    @Inject(COMPRA_REPOSITORY) private readonly repo: CompraRepository,
    private readonly pagos: ProcesarPagoService,
  ) {}

  async ejecutar(token: string, s: SolicitudPagarCuotas) {
    const orden = await this.repo.orden(token, s.ordenId);
    if (!orden) throw new NotFoundException(COMPRA_NO_EXISTE);

    const pago = pagoConfirmado(orden);
    if (!pago) throw new ConflictException(COMPRA_SIN_PAGAR);
    if (pago.modo !== 'CUOTAS') throw new ConflictException(COMPRA_SIN_CUOTAS);

    // Reintento de un pago que ya se aplicó (se perdió la respuesta, doble clic): lo mismo, sin cobrar otra vez.
    const previas = pago.cuotas.filter((c) => c.clave === s.idempotencyKey);
    if (previas.length > 0) {
      return vistaCuotasPagadas({
        repetido: true,
        referencia: previas[0]!.referencia ?? '',
        montoPagado: sumar(...previas.map((c) => c.monto)),
        cuotasPagadas: previas.map((c) => c.numero),
        cuotas: pago.cuotas,
      });
    }

    const pendientes = pago.cuotas
      .filter((c) => c.estado === 'PENDIENTE')
      .sort((a, b) => a.numero - b.numero);
    if (pendientes.length === 0) throw new ConflictException(CUOTAS_AL_DIA);
    if (s.cantidad > pendientes.length) {
      throw new BadRequestException(
        pendientes.length === 1
          ? 'Solo te queda 1 cuota por pagar'
          : `Solo te quedan ${pendientes.length} cuotas por pagar`,
      );
    }

    const monto = sumar(...pendientes.slice(0, s.cantidad).map((c) => c.monto));
    const cobro = await this.pagos.cobrarCuotas({
      ordenId: orden.id,
      monto,
      idempotencyKey: s.idempotencyKey,
    });
    if (cobro.estado === 'RECHAZADO') {
      throw new BadRequestException(PAGO_RECHAZADO);
    }

    return vistaCuotasPagadas(
      await this.repo.pagarCuotas(token, {
        ordenId: orden.id,
        cantidad: s.cantidad,
        referencia: cobro.referencia,
        clave: s.idempotencyKey,
        monto,
      }),
    );
  }
}

/** Respuesta del pago: lo cobrado y el cronograma al día, con los días que faltan para cada cuota pendiente. */
export function vistaCuotasPagadas(
  r: CuotasPagadas,
  hoy: string = hoyEnLima(),
) {
  return {
    pago: {
      referencia: r.referencia,
      montoPagado: aJson(r.montoPagado),
      cuotasPagadas: r.cuotasPagadas,
      cuotasPendientes: r.cuotas.filter((c) => c.estado === 'PENDIENTE').length,
      cuotas: aCuotasResumen(r.cuotas, hoy),
    },
  };
}
