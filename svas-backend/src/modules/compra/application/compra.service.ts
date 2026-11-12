import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type Decimal from 'decimal.js';
import { aJson, redondear } from '../../../common/utils/money.util';
import { enmascararDocumento } from '../../../common/utils/mask.util';
import {
  REGISTRO_ESTRATEGIAS,
  type RegistroEstrategias,
} from '../../cotizacion/domain/estrategia-cotizacion.port';
import {
  TARIFA_REPOSITORY,
  type TarifaRepository,
} from '../../cotizacion/domain/tarifa.repository.port';
import { montoTotalPago, MINIMO_CUOTAS } from '../../pagos/domain/monto-pago';
import { ArmarCopiaContenidoService } from '../../planes/application/armar-copia-contenido.service';
import {
  camposFaltantes,
  type CotizacionCompra,
  type DescuentoCompra,
  primaConDescuento,
  recargoPorcentaje,
} from '../domain/compra';
import {
  COMPRA_REPOSITORY,
  type CompraRepository,
} from '../domain/compra.repository.port';
import { PLAN_NO_DISPONIBLE, planTarifa } from './tarifa-compra';
import { vistaOrden } from './vista-orden';

export const COTIZACION_NO_EXISTE = 'La cotización no existe';
export const PLAN_FUERA_DE_COTIZACION = 'Ese plan no está en tu cotización';
export const COMPRA_NO_EXISTE = 'La compra no existe';
export const COMPRA_CON_OTRO_PLAN =
  'Ya iniciaste tu compra con otro plan de esta cotización';

export interface NuevaCompra {
  cotizacionId: string;
  primaCotizadaId: string;
  aceptaCondiciones: boolean;
  firmaSimulada: string;
  origen?: 'RETOMA';
}

/**
 * Compra antes del pago (doc conexión §6 "Compra", contexto CU-02):
 * resumen con montos → datos faltantes → orden con la copia del plan (RN-45).
 * El cobro y la emisión van en PagarYEmitirUseCase.
 */
@Injectable()
export class CompraService {
  constructor(
    @Inject(COMPRA_REPOSITORY) private readonly repo: CompraRepository,
    @Inject(TARIFA_REPOSITORY) private readonly tarifas: TarifaRepository,
    @Inject(REGISTRO_ESTRATEGIAS)
    private readonly estrategias: RegistroEstrategias,
    private readonly copia: ArmarCopiaContenidoService,
  ) {}

  /**
   * Montos que el frontend solo muestra (RN-38). Sin orden, el descuento es
   * la vista previa de las reglas de crear_orden_compra; con orden, los
   * montos ya congelados en ella.
   */
  async resumen(token: string, cotizacionId: string, primaCotizadaId: string) {
    const cot = await this.cotizacionDe(token, cotizacionId);
    const prima = await this.repo.prima(token, cotizacionId, primaCotizadaId);
    if (!prima) throw new NotFoundException(PLAN_FUERA_DE_COTIZACION);

    let montos: {
      primaAnual: Decimal;
      descuento: (DescuentoCompra & { provisional: boolean }) | null;
      primaFinal: Decimal;
      tarifa: { aseguradoraId: string; codigoEstrategia: string } | null;
    };
    if (cot.orden) {
      if (cot.orden.primaCotizadaId !== primaCotizadaId) {
        throw new ConflictException(COMPRA_CON_OTRO_PLAN);
      }
      const o = await this.repo.orden(token, cot.orden.id);
      if (!o) throw new NotFoundException(COMPRA_NO_EXISTE);
      montos = {
        primaAnual: o.primaAnual,
        descuento: o.descuento && { ...o.descuento, provisional: false },
        primaFinal: o.primaFinal,
        tarifa: o.tarifa,
      };
    } else {
      if (!prima.disponible) throw new BadRequestException(PLAN_NO_DISPONIBLE);
      const d = await this.repo.vistaPreviaDescuento(
        token,
        cotizacionId,
        primaCotizadaId,
      );
      montos = {
        primaAnual: redondear(prima.prima),
        descuento: d,
        primaFinal: primaConDescuento(prima.prima, d?.porcentaje ?? null),
        tarifa: {
          aseguradoraId: prima.aseguradoraId,
          codigoEstrategia: prima.codigoEstrategia,
        },
      };
    }
    if (!montos.tarifa) throw new BadRequestException(PLAN_NO_DISPONIBLE);

    const [plan, maxCuotas] = await Promise.all([
      planTarifa(this.tarifas, montos.tarifa.aseguradoraId, prima.planId),
      this.repo.maxCuotas(),
    ]);
    const estrategia = this.estrategias.obtener(montos.tarifa.codigoEstrategia);
    const { primaFinal } = montos;

    let cuotas = null;
    if (maxCuotas >= MINIMO_CUOTAS) {
      const total = montoTotalPago(estrategia, primaFinal, plan, 'CUOTAS');
      cuotas = {
        numeroCuotas: maxCuotas,
        total: aJson(total),
        cuotaMensual: aJson(total.dividedBy(maxCuotas)),
        recargoPorcentaje: aJson(recargoPorcentaje(primaFinal, total)),
      };
    }

    return {
      cotizacionId,
      primaCotizadaId,
      ordenId: cot.orden?.id ?? null,
      aseguradora: prima.aseguradora,
      plan: prima.plan,
      sumaAsegurada: aJson(prima.sumaAsegurada),
      primaAnual: aJson(montos.primaAnual),
      descuento: montos.descuento && {
        tipo: montos.descuento.tipo,
        porcentaje: aJson(montos.descuento.porcentaje),
        provisional: montos.descuento.provisional,
      },
      primaFinal: aJson(primaFinal),
      pago: {
        UNICO: {
          total: aJson(montoTotalPago(estrategia, primaFinal, plan, 'UNICO')),
        },
        CUOTAS: cuotas,
        maxCuotas,
      },
    };
  }

  /** RNF-08: solo lo que la cotización no capturó. */
  async camposFaltantes(token: string, cotizacionId: string) {
    const cot = await this.cotizacionDe(token, cotizacionId);
    return { campos: camposFaltantes(cot) };
  }

  async guardarDatos(
    token: string,
    cotizacionId: string,
    datos: { numeroDocumento?: string; placa?: string },
  ) {
    if (!datos.numeroDocumento && !datos.placa) {
      throw new BadRequestException(
        'Envía tu número de documento o la placa del vehículo',
      );
    }
    const r = await this.repo.completarDatos(token, cotizacionId, datos);
    return {
      numeroDocumento: enmascararDocumento(r.numeroDocumento),
      placa: r.placa,
      camposFaltantes: camposFaltantes(r),
    };
  }

  /** POST /compras: el backend arma la copia del plan; el RPC decide descuento y canal. */
  async crear(token: string, c: NuevaCompra) {
    await this.cotizacionDe(token, c.cotizacionId);
    const prima = await this.repo.prima(
      token,
      c.cotizacionId,
      c.primaCotizadaId,
    );
    if (!prima) throw new NotFoundException(PLAN_FUERA_DE_COTIZACION);

    const contenidoPlan = await this.copia.armar(prima.planId);
    const ordenId = await this.repo.crearOrden(token, {
      cotizacionId: c.cotizacionId,
      primaCotizadaId: c.primaCotizadaId,
      origen: c.origen ?? null,
      contenidoPlan,
      aceptaCondiciones: c.aceptaCondiciones,
      firmaSimulada: c.firmaSimulada,
    });
    return this.estado(token, ordenId);
  }

  async estado(token: string, ordenId: string) {
    const o = await this.repo.orden(token, ordenId);
    if (!o) throw new NotFoundException(COMPRA_NO_EXISTE);
    return vistaOrden(o);
  }

  /** RLS: una cotización ajena no se ve, así que también es 404 (doc conexión §8). */
  private async cotizacionDe(
    token: string,
    cotizacionId: string,
  ): Promise<CotizacionCompra> {
    const cot = await this.repo.cotizacion(token, cotizacionId);
    if (!cot) throw new NotFoundException(COTIZACION_NO_EXISTE);
    return cot;
  }
}
