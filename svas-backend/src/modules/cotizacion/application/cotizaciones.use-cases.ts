import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { generarToken, sha256Hex } from '../../../common/utils/token.util';
import type {
  CanalContacto,
  OpcionVenta,
  UsoVehiculo,
} from '../../../shared/types/enums';
import {
  CATALOGO_PUBLICO_REPOSITORY,
  type CatalogoPublicoRepository,
} from '../domain/catalogo-publico.port';
import {
  decidirDerivacion,
  validarContraCatalogo,
  verificarNicho,
} from '../domain/cotizacion';
import {
  COTIZACION_REPOSITORY,
  type CotizacionGuardada,
  type CotizacionRepository,
} from '../domain/cotizacion.repository.port';
import { unirCampos } from '../domain/formulario-dinamico';
import {
  TARIFA_REPOSITORY,
  type TarifaRepository,
} from '../domain/tarifa.repository.port';
import type { VehiculoCotizable } from '../domain/tarifa.types';
import { CalculadoraPrimasService } from './calculadora-primas.service';

// ── Respuestas (doc conexión §6, Cotización) ────────────────────────────────

export interface Advertencia {
  code: 'ASEGURADORA_SIN_COTIZACION' | 'SIMULACION_DESACTUALIZADA';
  message: string;
}

export interface PrimaDto {
  id: string;
  aseguradoraId: string;
  aseguradora: string;
  planId: string;
  plan: string;
  /** Frase de venta del plan; null hasta que exista el contenido (0020). */
  resumen: string | null;
  disponible: boolean;
  sumaAsegurada: string | null;
  rangoSuma: { minima: string; maxima: string } | null;
  prima: string | null;
  primaMensual: string | null;
  motivoNoDisponible: string | null;
  /** Solo ASESOR / ADMINISTRADOR (RN-41). */
  detalleCalculo?: Record<string, unknown> | null;
}

export interface CotizacionDto {
  id: string;
  estado: string;
  fecha: string;
  opciones: OpcionVenta[];
  motivoDerivacion: string | null;
  vehiculo: {
    uso: UsoVehiculo;
    marca: string;
    modelo: string;
    tipo: string;
    anio: number;
    ubigeo: string;
    distrito?: string;
  };
  primas: PrimaDto[];
}

export const WARN_SIMULACION_DESACTUALIZADA: Advertencia = {
  code: 'SIMULACION_DESACTUALIZADA',
  message:
    'Cambiaste tu suma asegurada; vuelve a simular para ver tus costos reales.',
};

type Rango = { minima: Decimal; maxima: Decimal } | null;

const fijo = (d: Decimal | null | undefined) => (d ? d.toFixed(2) : null);
const aRango = (r: Rango) =>
  r ? { minima: r.minima.toFixed(2), maxima: r.maxima.toFixed(2) } : null;

/** 12000 → "USD 12,000.00" (mensajes al cliente, doc conexión §6). */
export function formatearUsd(d: Decimal): string {
  const [entero, decimales] = d.toFixed(2).split('.');
  return `USD ${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimales}`;
}

function advertenciaSinCotizacion(nombres: string[]): Advertencia | undefined {
  if (!nombres.length) return undefined;
  const sujeto =
    nombres.length === 1
      ? `${nombres[0]} no pudo`
      : `${nombres.join(', ')} no pudieron`;
  return {
    code: 'ASEGURADORA_SIN_COTIZACION',
    message: `${sujeto} cotizar este vehículo; te mostramos las demás.`,
  };
}

/** Aseguradoras que no dejaron ninguna prima disponible (RF-05). */
function sinCotizacion(
  primas: { aseguradora: string; disponible: boolean }[],
): string[] {
  const porAseguradora = new Map<string, boolean>();
  for (const p of primas) {
    porAseguradora.set(
      p.aseguradora,
      (porAseguradora.get(p.aseguradora) ?? false) || p.disponible,
    );
  }
  return [...porAseguradora]
    .filter(([, alguna]) => !alguna)
    .map(([nombre]) => nombre)
    .sort((a, b) => a.localeCompare(b, 'es'));
}

const ordenarPrimas = (a: PrimaDto, b: PrimaDto) =>
  a.aseguradora.localeCompare(b.aseguradora, 'es') ||
  (a.prima === null ? 1 : 0) - (b.prima === null ? 1 : 0) ||
  Number(a.prima ?? 0) - Number(b.prima ?? 0);

// ── POST /cotizaciones ──────────────────────────────────────────────────────

export interface DatosCotizar {
  vehiculo: {
    uso: UsoVehiculo;
    marcaId: string;
    modeloId: string;
    anio: number;
    clase?: string | null;
    placa?: string | null;
  };
  ubicacion: { ubigeo: string };
  contacto: {
    nombres: string;
    apellidos: string;
    telefono: string;
    email: string;
    canalPreferido: CanalContacto;
  };
}

/**
 * CU-01 (contexto §8.1): RF-03 → RN-05 → 5 Estrategias en paralelo con la
 * suma inicial (punto medio, RN-37) → derivación RN-01..04 → RPC 6.1.
 * El token en claro se devuelve UNA vez; en la base queda su sha256.
 */
@Injectable()
export class CotizarUseCase {
  constructor(
    @Inject(CATALOGO_PUBLICO_REPOSITORY)
    private readonly catalogo: CatalogoPublicoRepository,
    @Inject(COTIZACION_REPOSITORY) private readonly repo: CotizacionRepository,
    private readonly calculadora: CalculadoraPrimasService,
  ) {}

  async ejecutar(d: DatosCotizar): Promise<{
    cotizacion: CotizacionDto;
    tokenAcceso: string;
    warning?: Advertencia;
  }> {
    const [campos, reglas] = await Promise.all([
      this.catalogo.camposActivos(),
      this.catalogo.reglasInspeccion(),
    ]);

    // RF-03: lo enviado contra la unión de campos activos (RN-17)
    const errores = validarContraCatalogo(
      {
        marca: d.vehiculo.marcaId,
        modelo: d.vehiculo.modeloId,
        anio: d.vehiculo.anio,
        ubigeo: d.ubicacion.ubigeo,
        placa: d.vehiculo.placa,
        clase: d.vehiculo.clase,
      },
      unirCampos(campos),
    );
    if (errores.length) {
      throw new BadRequestException({
        message: errores[0].mensaje,
        errors: errores,
      });
    }

    const v = await this.catalogo.resolverVehiculo(
      d.vehiculo.modeloId,
      d.vehiculo.anio,
      d.ubicacion.ubigeo,
    );
    if (!v) {
      throw new BadRequestException({
        message: 'El modelo o el distrito elegidos no están disponibles',
        errors: [
          {
            campo: 'vehiculo.modeloId',
            mensaje: 'Elige un modelo de la lista',
          },
          {
            campo: 'ubicacion.ubigeo',
            mensaje: 'Elige un distrito de la lista',
          },
        ],
      });
    }
    if (v.marcaId !== d.vehiculo.marcaId) {
      throw new BadRequestException({
        message: 'El modelo no pertenece a la marca elegida',
        errors: [
          {
            campo: 'vehiculo.modeloId',
            mensaje: 'El modelo no pertenece a la marca elegida',
          },
        ],
      });
    }

    // RN-05: fuera de nicho no se crea cotización ni solicitud
    const fueraDeNicho = verificarNicho(
      d.vehiculo.uso,
      await this.repo.contarAsegurados(d.contacto.email, d.contacto.telefono),
    );
    if (fueraDeNicho) throw new UnprocessableEntityException(fueraDeNicho);

    const aseguradoras = await this.calculadora.calcular(v); // sin suma → punto medio (RN-37)
    const primas = aseguradoras.flatMap((a) => a.planes);
    const derivacion = decidirDerivacion(
      d.vehiculo.uso,
      primas.some((p) => p.disponible),
      reglas,
    );

    const token = generarToken();
    const r = await this.repo.registrar({
      contacto: d.contacto,
      vehiculo: {
        uso: d.vehiculo.uso,
        modeloId: v.modeloId,
        anio: v.anio,
        clase: d.vehiculo.clase,
        placa: d.vehiculo.placa,
        ubigeo: v.ubigeo,
      },
      tokenHash: sha256Hex(token),
      opciones: derivacion.opciones,
      motivoDerivacion: derivacion.motivo,
      primas,
    });

    const idPorPlan = new Map(r.primas.map((p) => [p.planId, p.id]));
    const primasDto: PrimaDto[] = aseguradoras
      .flatMap((a) =>
        a.planes.map((p) => ({
          id: idPorPlan.get(p.planId) ?? '',
          aseguradoraId: a.aseguradoraId,
          aseguradora: a.aseguradora,
          planId: p.planId,
          plan: p.plan,
          resumen: null,
          disponible: p.disponible,
          sumaAsegurada: fijo(p.sumaAsegurada),
          rangoSuma: aRango(a.rangoSuma),
          prima: fijo(p.prima),
          primaMensual: fijo(p.primaMensual),
          motivoNoDisponible: p.motivoNoDisponible ?? null,
        })),
      )
      .sort(ordenarPrimas);

    const sin = aseguradoras
      .filter((a) => !a.planes.some((p) => p.disponible))
      .map((a) => a.aseguradora);

    return {
      cotizacion: {
        id: r.cotizacionId,
        estado: 'REGISTRADA',
        fecha: r.fecha,
        opciones: derivacion.opciones,
        motivoDerivacion: derivacion.motivo,
        vehiculo: {
          uso: d.vehiculo.uso,
          marca: v.marca,
          modelo: v.modelo,
          tipo: v.tipo,
          anio: v.anio,
          ubigeo: v.ubigeo,
        },
        primas: primasDto,
      },
      tokenAcceso: token,
      warning: advertenciaSinCotizacion(sin),
    };
  }
}

// ── Utilidades compartidas por resumen y ajuste ─────────────────────────────

async function rangosPorAseguradora(
  tarifas: TarifaRepository,
  cot: CotizacionGuardada,
): Promise<Map<string, Rango>> {
  const ids = [...new Set(cot.primas.map((p) => p.aseguradoraId))];
  const clave = `${cot.vehiculo.modeloId}:${cot.vehiculo.anio}`;
  const pares = await Promise.all(
    ids.map(async (id): Promise<[string, Rango]> => {
      try {
        return [id, (await tarifas.cargar(id)).rangos.get(clave) ?? null];
      } catch {
        return [id, null];
      }
    }),
  );
  return new Map(pares);
}

function aPrimaDto(
  p: CotizacionGuardada['primas'][number],
  rango: Rango,
  verDesglose: boolean,
): PrimaDto {
  return {
    id: p.id,
    aseguradoraId: p.aseguradoraId,
    aseguradora: p.aseguradora,
    planId: p.planId,
    plan: p.plan,
    resumen: null,
    disponible: p.disponible,
    sumaAsegurada: fijo(p.sumaAsegurada),
    rangoSuma: aRango(rango),
    prima: fijo(p.prima),
    primaMensual: fijo(p.primaMensual),
    motivoNoDisponible: p.motivoNoDisponible,
    ...(verDesglose ? { detalleCalculo: p.detalleCalculo } : {}),
  };
}

function vehiculoCotizable(cot: CotizacionGuardada): VehiculoCotizable {
  const v = cot.vehiculo;
  return {
    marcaId: v.marcaId,
    modeloId: v.modeloId,
    tipoId: v.tipoId,
    anio: v.anio,
    ubigeo: v.ubigeo,
  };
}

// ── GET /cotizaciones/:id/resumen ───────────────────────────────────────────

/** El acceso (JWT dueño/asesor/admin o X-Cotizacion-Token) ya lo validó CotizacionAccesoGuard. */
@Injectable()
export class ObtenerResumenUseCase {
  constructor(
    @Inject(COTIZACION_REPOSITORY) private readonly repo: CotizacionRepository,
    @Inject(TARIFA_REPOSITORY) private readonly tarifas: TarifaRepository,
  ) {}

  async ejecutar(
    id: string,
    verDesglose: boolean,
  ): Promise<{ cotizacion: CotizacionDto; warning?: Advertencia }> {
    const cot = await this.repo.obtener(id);
    if (!cot) throw new NotFoundException('No encontramos tu cotización');
    const rangos = await rangosPorAseguradora(this.tarifas, cot);
    const primas = cot.primas
      .map((p) =>
        aPrimaDto(p, rangos.get(p.aseguradoraId) ?? null, verDesglose),
      )
      .sort(ordenarPrimas);
    return {
      cotizacion: {
        id: cot.id,
        estado: cot.estado,
        fecha: cot.fecha,
        opciones: cot.opciones,
        motivoDerivacion: cot.motivoDerivacion,
        vehiculo: {
          uso: cot.vehiculo.uso,
          marca: cot.vehiculo.marca,
          modelo: cot.vehiculo.modelo,
          tipo: cot.vehiculo.tipo,
          anio: cot.vehiculo.anio,
          ubigeo: cot.vehiculo.ubigeo,
          distrito: cot.vehiculo.distrito,
        },
        primas,
      },
      warning: advertenciaSinCotizacion(sinCotizacion(cot.primas)),
    };
  }
}

// ── PATCH /cotizaciones/:id/aseguradoras/:aseguradoraId/suma-asegurada ──────

/**
 * RN-37: recalcula las primas de UNA aseguradora con la suma pedida (la
 * Estrategia valida el rango) y persiste con el RPC 6.13, que lo revalida.
 * El frontend nunca calcula.
 */
@Injectable()
export class AjustarSumaUseCase {
  constructor(
    @Inject(COTIZACION_REPOSITORY) private readonly repo: CotizacionRepository,
    private readonly calculadora: CalculadoraPrimasService,
  ) {}

  async ejecutar(d: {
    cotizacionId: string;
    aseguradoraId: string;
    sumaAsegurada: string;
    /** Con JWT el RPC corre como el CLIENTE dueño; sin él, como service_role. */
    accessToken?: string;
    verDesglose: boolean;
  }): Promise<{ primas: PrimaDto[]; warning?: Advertencia }> {
    const cot = await this.repo.obtener(d.cotizacionId);
    if (!cot) throw new NotFoundException('No encontramos tu cotización');
    if (cot.estado === 'CONVERTIDA') {
      throw new ConflictException(
        'Ya iniciaste tu compra: la suma asegurada ya no se puede cambiar.',
      );
    }
    const guardadas = cot.primas.filter(
      (p) => p.aseguradoraId === d.aseguradoraId,
    );
    if (!guardadas.length) {
      throw new NotFoundException(
        'Tu cotización no tiene planes de esa aseguradora',
      );
    }

    const [a] = await this.calculadora.calcular(vehiculoCotizable(cot), {
      suma: new Decimal(d.sumaAsegurada),
      aseguradoraIds: [d.aseguradoraId],
    });
    const nombre = guardadas[0].aseguradora;
    if (!a) {
      throw new BadRequestException(
        `${nombre} ya no está disponible para cotizar`,
      );
    }
    if (a.errorSuma && a.rangoSuma) {
      const { minima, maxima } = a.rangoSuma;
      throw new BadRequestException({
        message: `La suma asegurada de ${nombre} debe estar entre ${formatearUsd(minima)} y ${formatearUsd(maxima)}`,
        errors: [
          {
            campo: 'sumaAsegurada',
            mensaje: `Fuera del rango permitido (${minima.toFixed(2)} – ${maxima.toFixed(2)})`,
          },
        ],
      });
    }
    if (!a.planes.length || a.planes.some((p) => !p.disponible)) {
      throw new BadRequestException(`${nombre} no puede cotizar este vehículo`);
    }

    const r = await this.repo.actualizarSuma(
      d.cotizacionId,
      d.aseguradoraId,
      a.planes,
      d.accessToken,
    );

    const idPorPlan = new Map(guardadas.map((p) => [p.planId, p.id]));
    const primas = a.planes
      .map((p) =>
        aPrimaDto(
          {
            id: idPorPlan.get(p.planId) ?? '',
            planId: p.planId,
            plan: p.plan,
            aseguradoraId: a.aseguradoraId,
            aseguradora: a.aseguradora,
            disponible: true,
            motivoNoDisponible: null,
            sumaAsegurada: p.sumaAsegurada ?? null,
            prima: p.prima ?? null,
            primaMensual: p.primaMensual ?? null,
            detalleCalculo: p.detalleCalculo ?? null,
          },
          a.rangoSuma,
          d.verDesglose,
        ),
      )
      .sort(ordenarPrimas);

    return {
      primas,
      warning:
        r.simulacionesInvalidadas > 0
          ? WARN_SIMULACION_DESACTUALIZADA
          : undefined,
    };
  }
}

// ── PATCH /cotizaciones/:id/cliente ─────────────────────────────────────────

/** Backend §4.4: al iniciar sesión, la cotización anónima pasa a la cuenta. */
@Injectable()
export class VincularClienteUseCase {
  constructor(
    @Inject(COTIZACION_REPOSITORY) private readonly repo: CotizacionRepository,
  ) {}

  async ejecutar(d: {
    usuarioId: string;
    cotizacionId: string;
    tokenAcceso?: string;
    contacto: {
      nombres?: string;
      apellidos?: string;
      telefono?: string;
      canalPreferido?: CanalContacto;
    };
  }): Promise<{ cotizacionId: string; clienteId: string }> {
    const { clienteId } = await this.repo.vincularCliente({
      usuarioId: d.usuarioId,
      cotizacionId: d.cotizacionId,
      tokenHash: d.tokenAcceso ? sha256Hex(d.tokenAcceso) : null,
      contacto: d.contacto,
    });
    return { cotizacionId: d.cotizacionId, clienteId };
  }
}

// ── GET /cotizaciones/mias ──────────────────────────────────────────────────

@Injectable()
export class MisCotizacionesUseCase {
  constructor(
    @Inject(COTIZACION_REPOSITORY) private readonly repo: CotizacionRepository,
  ) {}

  async ejecutar(accessToken: string) {
    return (await this.repo.listarMias(accessToken)).map((c) => ({
      id: c.id,
      fecha: c.fecha,
      estado: c.estado,
      vehiculo: { marca: c.marca, modelo: c.modelo, anio: c.anio },
      primaMensualDesde: fijo(c.primaMensualDesde),
    }));
  }
}
