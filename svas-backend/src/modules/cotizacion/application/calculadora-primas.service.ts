import { Inject, Injectable, Logger } from '@nestjs/common';
import type Decimal from 'decimal.js';
import {
  CATALOGO_PUBLICO_REPOSITORY,
  type AseguradoraActiva,
  type CatalogoPublicoRepository,
} from '../domain/catalogo-publico.port';
import {
  REGISTRO_ESTRATEGIAS,
  type RegistroEstrategias,
} from '../domain/estrategia-cotizacion.port';
import { SumaFueraDeRangoException } from '../domain/suma-fuera-de-rango.exception';
import {
  TARIFA_REPOSITORY,
  type TarifaRepository,
} from '../domain/tarifa.repository.port';
import type { ResultadoPlan, VehiculoCotizable } from '../domain/tarifa.types';

const TIMEOUT_MS = 2000;

export interface PlanCalculado extends ResultadoPlan {
  plan: string;
}

export interface PrimasAseguradora {
  aseguradoraId: string;
  aseguradora: string;
  codigoEstrategia: string;
  rangoSuma: { minima: Decimal; maxima: Decimal } | null;
  planes: PlanCalculado[];
  /** Mensaje si la suma pedida está fuera del rango de esta aseguradora (RN-37). */
  errorSuma?: string;
}

/**
 * Ejecuta las Estrategias de las aseguradoras activas en paralelo (RF-05: una
 * caída o un timeout de 2 s no bloquea a las demás → ERROR_ESTRATEGIA).
 * No guarda nada: lo usan el simulador del admin y el caso de uso cotizar.
 */
@Injectable()
export class CalculadoraPrimasService {
  private readonly logger = new Logger(CalculadoraPrimasService.name);

  constructor(
    @Inject(TARIFA_REPOSITORY) private readonly tarifas: TarifaRepository,
    @Inject(REGISTRO_ESTRATEGIAS)
    private readonly estrategias: RegistroEstrategias,
    @Inject(CATALOGO_PUBLICO_REPOSITORY)
    private readonly catalogo: CatalogoPublicoRepository,
  ) {}

  async calcular(
    v: VehiculoCotizable,
    opciones: { suma?: Decimal; aseguradoraIds?: string[] } = {},
  ): Promise<PrimasAseguradora[]> {
    const aseguradoras = (await this.catalogo.aseguradorasActivas()).filter(
      (a) => !opciones.aseguradoraIds || opciones.aseguradoraIds.includes(a.id),
    );
    return Promise.all(
      aseguradoras.map((a) => this.calcularUna(a, v, opciones.suma)),
    );
  }

  private async calcularUna(
    a: AseguradoraActiva,
    v: VehiculoCotizable,
    suma?: Decimal,
  ): Promise<PrimasAseguradora> {
    const base = {
      aseguradoraId: a.id,
      aseguradora: a.nombre,
      codigoEstrategia: a.codigoEstrategia,
    };
    let rangoSuma: PrimasAseguradora['rangoSuma'] = null;
    let nombres = new Map<string, string>();
    try {
      const tarifa = await this.tarifas.cargar(a.id);
      nombres = new Map(tarifa.planes.map((p) => [p.planId, p.nombre]));
      rangoSuma = tarifa.rangos.get(`${v.modeloId}:${v.anio}`) ?? null;

      const estrategia = this.estrategias.obtener(a.codigoEstrategia);
      for (const plan of tarifa.planes) {
        const r = estrategia.parametrosSchema.safeParse(plan.parametros); // "al cargar"
        if (!r.success)
          throw new Error(`Parámetros inválidos en el plan ${plan.nombre}`);
      }

      const planes = await conTimeout(
        estrategia.cotizar(v, tarifa, suma),
        TIMEOUT_MS,
      );
      return {
        ...base,
        rangoSuma,
        planes: planes.map((p) => ({
          ...p,
          plan: nombres.get(p.planId) ?? '',
        })),
      };
    } catch (e) {
      const planes = [...nombres].map(([planId, plan]) => ({
        planId,
        plan,
        disponible: false,
        motivoNoDisponible: 'ERROR_ESTRATEGIA' as const,
      }));
      if (e instanceof SumaFueraDeRangoException) {
        return {
          ...base,
          rangoSuma,
          planes,
          errorSuma: `${e.message} (${a.nombre})`,
        };
      }
      this.logger.warn(
        `Estrategia ${a.codigoEstrategia} falló: ${(e as Error).message}`,
      );
      return { ...base, rangoSuma, planes };
    }
  }
}

function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(
      () => rechazar(new Error(`Excedió ${ms} ms`)),
      ms,
    );
  });
  return Promise.race([promesa, limite]).finally(() =>
    clearTimeout(temporizador),
  );
}
