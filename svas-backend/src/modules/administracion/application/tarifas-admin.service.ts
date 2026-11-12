import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import type { ErrorCampo } from '../../../common/types/usuario-autenticado';
import {
  CalculadoraPrimasService,
  type PrimasAseguradora,
} from '../../cotizacion/application/calculadora-primas.service';
import {
  CATALOGO_PUBLICO_REPOSITORY,
  type CatalogoPublicoRepository,
} from '../../cotizacion/domain/catalogo-publico.port';
import {
  REGISTRO_ESTRATEGIAS,
  type RegistroEstrategias,
} from '../../cotizacion/domain/estrategia-cotizacion.port';
import {
  TARIFA_REPOSITORY,
  type TarifaRepository,
} from '../../cotizacion/domain/tarifa.repository.port';
import {
  claveValida,
  type FaltanteTarifa,
  type FilaPeso,
  type FilaRango,
  type TablaPeso,
} from '../domain/tarifas';
import {
  TARIFAS_ADMIN_REPOSITORY,
  type AseguradoraTarifa,
  type TarifasAdminRepository,
} from '../domain/tarifas-admin.repository.port';

const NOMBRE_PESO: Record<TablaPeso, string> = {
  marca: 'marca',
  modelo: 'modelo',
  anio: 'año',
  tipo: 'tipo de vehículo',
  ubigeo: 'ubigeo',
};

function errorDeCampos(errors: ErrorCampo[]): BadRequestException {
  return new BadRequestException({ message: errors[0].mensaje, errors });
}

/**
 * Tarifas del administrador (contexto §17, RN-37 a RN-40). Lo que depende de la
 * fórmula (qué `parametros` acepta, qué pesos usa) lo responde la Estrategia de
 * cada aseguradora; la base de datos solo guarda datos.
 */
@Injectable()
export class TarifasAdminService {
  constructor(
    @Inject(TARIFAS_ADMIN_REPOSITORY)
    private readonly repo: TarifasAdminRepository,
    @Inject(REGISTRO_ESTRATEGIAS)
    private readonly estrategias: RegistroEstrategias,
    @Inject(TARIFA_REPOSITORY)
    private readonly cacheTarifas: Pick<TarifaRepository, 'invalidar'>,
    @Inject(CalculadoraPrimasService)
    private readonly calculadora: Pick<CalculadoraPrimasService, 'calcular'>,
    @Inject(CATALOGO_PUBLICO_REPOSITORY)
    private readonly catalogo: Pick<
      CatalogoPublicoRepository,
      'resolverVehiculo'
    >,
  ) {}

  // ── Tasa base y parámetros ────────────────────────────────────────────────
  listarTarifasPlanes(token: string, aseguradoraId?: string) {
    return this.repo.listarTarifasPlanes(token, aseguradoraId);
  }

  async guardarTarifaPlan(
    token: string,
    planId: string,
    tasaBase: number,
    parametros: Record<string, unknown>,
  ) {
    const codigo = await this.repo.codigoEstrategiaDelPlan(token, planId);
    if (!codigo) throw new NotFoundException('El plan no existe');

    const r = this.estrategias
      .obtener(codigo)
      .parametrosSchema.safeParse(parametros);
    if (!r.success) {
      throw errorDeCampos(
        r.error.issues.map((i) => ({
          campo: ['parametros', ...i.path.map(String)].join('.'),
          mensaje:
            i.code === 'unrecognized_keys'
              ? `Parámetro no permitido para ${codigo}: ${i.keys.join(', ')}`
              : i.message,
        })),
      );
    }
    const guardada = await this.repo.guardarTarifaPlan(
      token,
      planId,
      tasaBase,
      r.data as Record<string, unknown>,
    );
    this.cacheTarifas.invalidar(guardada?.aseguradoraId);
    return guardada;
  }

  // ── Pesos ─────────────────────────────────────────────────────────────────
  async listarPesos(token: string, tabla: TablaPeso, aseguradoraId: string) {
    await this.aseguradora(token, aseguradoraId);
    return this.repo.listarPesos(token, tabla, aseguradoraId);
  }

  async guardarPesos(
    token: string,
    tabla: TablaPeso,
    aseguradoraId: string,
    filas: FilaPeso[],
  ) {
    const aseg = await this.aseguradora(token, aseguradoraId);
    const e = this.estrategias.obtener(aseg.codigoEstrategia);
    if (![...e.pesosRequeridos, ...e.pesosOpcionales].includes(tabla)) {
      throw errorDeCampos([
        {
          campo: 'tabla',
          mensaje: `La fórmula de ${aseg.nombre} no usa peso de ${NOMBRE_PESO[tabla]}`,
        },
      ]);
    }

    const errores: ErrorCampo[] = [];
    const vistas = new Set<string>();
    filas.forEach((f, i) => {
      if (!claveValida(tabla, f.clave)) {
        errores.push({
          campo: `filas.${i}.clave`,
          mensaje: `La clave "${f.clave}" no es un ${NOMBRE_PESO[tabla]} válido`,
        });
      } else if (vistas.has(f.clave)) {
        errores.push({
          campo: `filas.${i}.clave`,
          mensaje: `La clave "${f.clave}" está repetida`,
        });
      }
      vistas.add(f.clave);
    });
    if (errores.length) throw errorDeCampos(errores);

    const resumen = await this.repo.guardarPesos(
      token,
      tabla,
      aseguradoraId,
      filas,
    );
    this.cacheTarifas.invalidar(aseguradoraId);
    return resumen;
  }

  // ── Rangos de suma asegurada ──────────────────────────────────────────────
  async listarRangos(
    token: string,
    f: { aseguradoraId: string; marcaId?: string; modeloId?: string },
  ) {
    await this.aseguradora(token, f.aseguradoraId);
    return this.repo.listarRangos(token, f);
  }

  async guardarRangos(
    token: string,
    aseguradoraId: string,
    filas: FilaRango[],
  ) {
    await this.aseguradora(token, aseguradoraId);
    const errores: ErrorCampo[] = [];
    const vistas = new Set<string>();
    filas.forEach((r, i) => {
      if (r.sumaMinima > r.sumaMaxima) {
        errores.push({
          campo: `filas.${i}`,
          mensaje: 'La suma mínima no puede superar la suma máxima',
        });
      }
      const clave = `${r.modeloId}|${r.anio}`;
      if (vistas.has(clave)) {
        errores.push({
          campo: `filas.${i}`,
          mensaje: 'Hay rangos repetidos para el mismo modelo y año',
        });
      }
      vistas.add(clave);
    });
    if (errores.length) throw errorDeCampos(errores);

    const resumen = await this.repo.guardarRangos(token, aseguradoraId, filas);
    this.cacheTarifas.invalidar(aseguradoraId);
    return resumen;
  }

  // ── Completitud (§17.9) ───────────────────────────────────────────────────
  /** Modelos-año sin rango o sin algún peso que exige la fórmula de esa aseguradora. */
  async completitud(token: string, aseguradoraId?: string) {
    const aseguradoras = aseguradoraId
      ? [await this.aseguradora(token, aseguradoraId)]
      : (await this.repo.listarAseguradoras(token)).filter((a) => a.activa);

    const items: FaltanteTarifa[] = (
      await Promise.all(
        aseguradoras.map((a) =>
          this.repo.listarFaltantes(
            token,
            a.id,
            this.estrategias.obtener(a.codigoEstrategia).pesosRequeridos,
          ),
        ),
      )
    ).flat();

    return {
      completa: items.length === 0,
      sinRango: items.filter((i) => i.sinRango).length,
      conPesosFaltantes: items.filter((i) => i.pesosFaltantes.length > 0)
        .length,
      items,
    };
  }

  // ── Simulador (§17.6): mismas Estrategias que el cotizador, sin guardar nada ─
  async simular(d: {
    modeloId: string;
    anio: number;
    ubigeo: string;
    sumaAsegurada?: number;
  }) {
    const v = await this.catalogo.resolverVehiculo(
      d.modeloId,
      d.anio,
      d.ubigeo,
    );
    if (!v) throw new NotFoundException('El modelo o el ubigeo no existen');
    const suma =
      d.sumaAsegurada === undefined ? undefined : new Decimal(d.sumaAsegurada);
    const aseguradoras = await this.calculadora.calcular(v, { suma });
    return {
      vehiculo: {
        marca: v.marca,
        modelo: v.modelo,
        tipo: v.tipo,
        anio: v.anio,
        ubigeo: v.ubigeo,
      },
      aseguradoras: aseguradoras.map(aSimulacion),
    };
  }

  private async aseguradora(
    token: string,
    id: string,
  ): Promise<AseguradoraTarifa> {
    const aseg = (await this.repo.listarAseguradoras(token)).find(
      (a) => a.id === id,
    );
    if (!aseg) throw new NotFoundException('La aseguradora no existe');
    return aseg;
  }
}

const fijo = (d: Decimal | undefined, n: number) => (d ? d.toFixed(n) : null);

/** Decimal → string (montos en JSON siempre como string, doc conexión §5). */
function aSimulacion(a: PrimasAseguradora) {
  return {
    aseguradoraId: a.aseguradoraId,
    aseguradora: a.aseguradora,
    codigoEstrategia: a.codigoEstrategia,
    rangoSuma: a.rangoSuma
      ? {
          minima: a.rangoSuma.minima.toFixed(2),
          maxima: a.rangoSuma.maxima.toFixed(2),
        }
      : null,
    ...(a.errorSuma ? { errorSuma: a.errorSuma } : {}),
    planes: a.planes.map((p) => ({
      planId: p.planId,
      plan: p.plan,
      disponible: p.disponible,
      motivoNoDisponible: p.motivoNoDisponible ?? null,
      sumaAsegurada: fijo(p.sumaAsegurada, 2),
      prima: fijo(p.prima, 2),
      primaMensual: fijo(p.primaMensual, 2),
      detalleCalculo: p.detalleCalculo ?? null,
    })),
  };
}
