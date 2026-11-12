import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ErrorBaseDatos } from '../../../common/filters/postgrest-error.filter';
import {
  TARIFA_REPOSITORY,
  type TarifaRepository,
} from '../../cotizacion/domain/tarifa.repository.port';
import {
  ProcesarPagoService,
  type ResultadoPago,
} from '../../pagos/application/procesar-pago.service';
import { EmitirPdfService } from '../../polizas/application/emitir-pdf.service';
import { WARNING_PDF_EN_GENERACION } from '../../polizas/application/polizas.service';
import {
  EMISION_ASEGURADORA,
  type EmisionAseguradora,
} from '../../polizas/domain/emision-aseguradora.port';
import type { ModoPago } from '../../../shared/types/enums';
import type { OrdenCompra, PagoOrden } from '../domain/compra';
import {
  COMPRA_REPOSITORY,
  type CompraRepository,
  type PagoParaRegistrar,
} from '../domain/compra.repository.port';
import { COMPRA_NO_EXISTE } from './compra.service';
import { PLAN_NO_DISPONIBLE, planTarifa } from './tarifa-compra';
import { pagoConfirmado, vistaCompraPagada } from './vista-orden';

export const PAGO_RECHAZADO =
  'El pago fue rechazado. Revisa los datos de tu medio de pago o intenta con otro.';
export const COMPRA_YA_PAGADA = 'Esta compra ya está pagada';

export interface SolicitudPagar {
  ordenId: string;
  modo: ModoPago;
  numeroCuotas?: number;
  idempotencyKey: string;
}

/** Errores de la base que pueden venir de una carrera con un reintento de la misma compra. */
const esCarrera = (e: unknown) =>
  e instanceof ErrorBaseDatos && (e.code === 'PT409' || e.code === '23505');

/**
 * POST /compras/:id/pago (arquitectura backend §6, paso 7).
 *
 * Idempotencia sin estado en memoria: la pasarela devuelve la misma
 * referencia para la misma orden + Idempotency-Key, y pago.referencia es
 * única. Si la orden ya tiene un pago con esa referencia, la petición es un
 * reintento y se responde lo mismo que la primera vez (201 o el mismo 400).
 */
@Injectable()
export class PagarYEmitirUseCase {
  private readonly logger = new Logger(PagarYEmitirUseCase.name);

  constructor(
    @Inject(COMPRA_REPOSITORY) private readonly repo: CompraRepository,
    @Inject(TARIFA_REPOSITORY) private readonly tarifas: TarifaRepository,
    @Inject(EMISION_ASEGURADORA)
    private readonly emision: EmisionAseguradora,
    private readonly pagos: ProcesarPagoService,
    private readonly pdf: EmitirPdfService,
  ) {}

  async ejecutar(token: string, s: SolicitudPagar) {
    // a. La orden con el JWT del cliente: si es ajena, RLS la oculta → 404.
    const orden = await this.leerOrden(token, s.ordenId);
    if (!orden.tarifa) throw new BadRequestException(PLAN_NO_DISPONIBLE);

    const [plan, maxCuotas] = await Promise.all([
      planTarifa(this.tarifas, orden.tarifa.aseguradoraId, orden.planId),
      this.repo.maxCuotas(),
    ]);

    // a'. + b. Total con la regla de la aseguradora (RN-38) y cobro.
    const cobro = await this.pagos.cobrar({
      ordenId: orden.id,
      primaFinal: orden.primaFinal,
      codigoEstrategia: orden.tarifa.codigoEstrategia,
      plan,
      modo: s.modo,
      numeroCuotas: s.numeroCuotas,
      maxCuotas,
      idempotencyKey: s.idempotencyKey,
    });

    const previo = orden.pagos.find((p) => p.referencia === cobro.referencia);
    if (previo) return this.repetir(token, orden, previo);
    if (pagoConfirmado(orden)) throw new ConflictException(COMPRA_YA_PAGADA);

    const registro: PagoParaRegistrar = {
      ordenId: orden.id,
      modo: cobro.modo,
      numeroCuotas: cobro.numeroCuotas,
      referencia: cobro.referencia,
      montoTotal: cobro.montoTotal,
    };

    if (cobro.estado === 'RECHAZADO') {
      await this.registrarRechazo(token, registro);
      throw new BadRequestException(PAGO_RECHAZADO);
    }

    // c. + d. Emisión (mismo número para la misma orden) y confirmación todo o nada.
    const { numeroPoliza } = await this.emision.emitir({
      codigoEstrategia: orden.tarifa.codigoEstrategia,
      ordenId: orden.id,
    });
    try {
      await this.repo.confirmar(token, { ...registro, numeroPoliza });
    } catch (e) {
      if (!esCarrera(e)) throw e;
      // Otro intento con la misma clave confirmó primero: se responde lo mismo.
      return this.repetirTrasCarrera(token, orden.id, cobro, e);
    }

    // e. PDF fuera de la transacción; si falla, el job lo reintenta.
    return this.responder(token, orden.id, cobro.referencia);
  }

  private async leerOrden(
    token: string,
    ordenId: string,
  ): Promise<OrdenCompra> {
    const orden = await this.repo.orden(token, ordenId);
    if (!orden) throw new NotFoundException(COMPRA_NO_EXISTE);
    return orden;
  }

  private async registrarRechazo(token: string, p: PagoParaRegistrar) {
    try {
      await this.repo.registrarRechazo(token, p);
    } catch (e) {
      // Un reintento simultáneo ya lo registró (referencia única).
      if (!(e instanceof ErrorBaseDatos && e.code === '23505')) throw e;
    }
  }

  private async repetir(token: string, orden: OrdenCompra, previo: PagoOrden) {
    if (previo.estado !== 'CONFIRMADO') {
      throw new BadRequestException(PAGO_RECHAZADO);
    }
    return this.responder(token, orden.id, previo.referencia, orden);
  }

  private async repetirTrasCarrera(
    token: string,
    ordenId: string,
    cobro: ResultadoPago,
    error: unknown,
  ) {
    const orden = await this.leerOrden(token, ordenId);
    const previo = orden.pagos.find((p) => p.referencia === cobro.referencia);
    if (!previo) throw error;
    return this.repetir(token, orden, previo);
  }

  /** 201 { compra, warning? }; genera el PDF si aún no está. */
  private async responder(
    token: string,
    ordenId: string,
    referencia: string,
    leida?: OrdenCompra,
  ) {
    let orden = leida ?? (await this.leerOrden(token, ordenId));
    const pago = orden.pagos.find((p) => p.referencia === referencia);
    if (!pago || !orden.poliza) {
      throw new Error(`La orden ${ordenId} no quedó confirmada`);
    }
    let pdfListo = orden.poliza.pdfDisponible;
    if (!pdfListo) {
      pdfListo = await this.pdf.intentar(orden.poliza.id);
      if (!pdfListo) {
        this.logger.warn(
          `PDF de la póliza ${orden.poliza.id} pendiente; lo reintenta el job`,
        );
      }
      orden = {
        ...orden,
        poliza: { ...orden.poliza, pdfDisponible: pdfListo },
      };
    }
    return {
      compra: vistaCompraPagada(orden, pago),
      ...(pdfListo ? {} : { warning: WARNING_PDF_EN_GENERACION }),
    };
  }
}
