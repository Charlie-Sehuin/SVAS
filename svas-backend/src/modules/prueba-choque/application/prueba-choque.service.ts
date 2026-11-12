import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import type { UsoVehiculo } from '../../../shared/types/enums';
import {
  COTIZACION_REPOSITORY,
  type CotizacionRepository,
} from '../../cotizacion/domain/cotizacion.repository.port';
import { simular } from '../domain/motor-simulacion';
import type { CatalogoSimulacion } from '../domain/prueba-choque.repository.port';
import {
  PRUEBA_CHOQUE_REPOSITORY,
  type PruebaChoqueRepository,
} from '../domain/prueba-choque.repository.port';
import { armarRespuesta, warningIncompletos } from './vista-simulacion';

export interface PerfilDeclarado {
  estacionaCochera: boolean;
  kmMesAlto: boolean;
  usoNocturno: boolean;
  ingresoDiarioSoles?: string | null;
  preocupaciones?: string[];
}

/** Hash corto de las reglas usadas: permite saber con qué catálogo se simuló. */
export function versionReglas(c: CatalogoSimulacion): string {
  const json = JSON.stringify({
    zona: c.zona,
    escenarios: c.escenarios.map((e) => [e.id, e.montoDano, e.diasTaller]),
    reglas: [...c.reglas]
      .sort((a, b) =>
        `${a.planId}${a.escenarioId}`.localeCompare(
          `${b.planId}${b.escenarioId}`,
        ),
      )
      .map((r) => [
        r.planId,
        r.escenarioId,
        r.cubre,
        r.deduciblePct,
        r.deducibleMinimo,
        r.tope,
        r.diasReemplazo,
      ]),
    probabilidades: [...c.probabilidades].sort(([a], [b]) =>
      a.localeCompare(b),
    ),
    factores: c.factores.map((f) => [
      f.escenarioId,
      f.variable,
      f.multiplicador,
    ]),
    tipoCambio: c.tipoCambio,
  });
  return createHash('sha256').update(json).digest('hex').slice(0, 12);
}

const texto = (d: Decimal) => d.toFixed(2);

/** CU Prueba de Choque (contexto §8.2, §16). */
@Injectable()
export class PruebaChoqueService {
  constructor(
    @Inject(PRUEBA_CHOQUE_REPOSITORY)
    private readonly repo: PruebaChoqueRepository,
    @Inject(COTIZACION_REPOSITORY)
    private readonly cotizaciones: CotizacionRepository,
  ) {}

  /** GET /prueba-choque/escenarios?uso= (público). Con uso: probabilidad de referencia (zona MEDIA). */
  async escenarios(uso?: UsoVehiculo) {
    const [escenarios, probabilidades] = await Promise.all([
      this.repo.escenariosActivos(),
      uso ? this.repo.probabilidadesReferenciales(uso) : Promise.resolve(null),
    ]);
    return escenarios.map((e) => ({
      codigo: e.codigo,
      nombre: e.nombre,
      descripcion: e.descripcion,
      montoDanoReferencial: e.montoDano ? texto(e.montoDano) : null,
      diasTaller: e.diasTaller,
      ...(probabilidades && {
        probabilidadReferencial: (
          probabilidades.get(e.id) ?? new Decimal(0)
        ).toFixed(4),
      }),
    }));
  }

  /**
   * POST /cotizaciones/:id/prueba-choque. El dominio calcula; el RPC 6.2
   * guarda la instantánea. Con accessToken (JWT) el RPC exige CLIENTE dueño.
   */
  async simular(
    cotizacionId: string,
    perfil: PerfilDeclarado,
    accessToken?: string,
  ) {
    const cot = await this.cotizaciones.obtener(cotizacionId);
    if (!cot) throw new NotFoundException('No encontramos tu cotización');
    if (cot.estado !== 'REGISTRADA') {
      throw new BadRequestException('Esta cotización ya no se puede simular');
    }
    const primas = cot.primas.filter(
      (p) => p.disponible && p.prima && p.sumaAsegurada,
    );
    if (primas.length === 0) {
      throw new BadRequestException(
        'La cotización no tiene primas para simular',
      );
    }

    const catalogo = await this.repo.catalogo({
      planIds: primas.map((p) => p.planId),
      uso: cot.vehiculo.uso,
      ubigeo: cot.vehiculo.ubigeo,
    });

    const codigos = new Set(catalogo.escenarios.map((e) => e.codigo));
    const desconocida = (perfil.preocupaciones ?? []).find(
      (c) => !codigos.has(c),
    );
    if (desconocida)
      throw new BadRequestException(`La preocupación ${desconocida} no existe`);

    // RN-33: el ingreso solo cuenta (y solo se guarda) en uso comercial.
    const ingreso =
      cot.vehiculo.uso !== 'PARTICULAR' && perfil.ingresoDiarioSoles
        ? new Decimal(perfil.ingresoDiarioSoles)
        : null;

    const salida = simular({
      uso: cot.vehiculo.uso,
      primas: primas.map((p) => ({
        primaCotizadaId: p.id,
        planId: p.planId,
        prima: p.prima!,
        sumaAsegurada: p.sumaAsegurada!,
      })),
      escenarios: catalogo.escenarios,
      reglas: catalogo.reglas,
      probabilidades: catalogo.probabilidades,
      factores: catalogo.factores,
      perfil: { ...perfil, ingresoDiarioSoles: ingreso },
      tipoCambio: catalogo.tipoCambio,
    });

    await this.repo.registrar(
      cotizacionId,
      {
        perfil: {
          estacionaCochera: perfil.estacionaCochera,
          kmMesAlto: perfil.kmMesAlto,
          usoNocturno: perfil.usoNocturno,
          ingresoDiarioSoles: ingreso ? texto(ingreso) : null,
          preocupaciones: perfil.preocupaciones ?? [],
        },
        zona: catalogo.zona,
        versionReglas: versionReglas(catalogo),
        planes: salida.planes.map((p) => ({
          primaCotizadaId: p.primaCotizadaId,
          costoRealAnual: texto(p.costoRealAnual),
          peorCaso: texto(p.peorCaso),
          ranking: p.ranking,
          datosCompletos: p.datosCompletos,
        })),
        resultados: salida.resultados.map((r) => ({
          primaCotizadaId: r.primaCotizadaId,
          escenarioId: r.escenarioId,
          sinDato: r.sinDato,
          cubre: r.cubre,
          probabilidad: r.probabilidad.toFixed(4),
          dano: texto(r.dano),
          cubierto: texto(r.cubierto),
          deducible: texto(r.deducible),
          noCubierto: texto(r.noCubierto),
          ingresoPerdido: texto(r.ingresoPerdido),
          desembolso: texto(r.desembolso),
        })),
      },
      accessToken,
    );

    const guardada = await this.repo.ultima(cotizacionId);
    if (!guardada) throw new NotFoundException('No encontramos la simulación');
    const warning = warningIncompletos(guardada);
    return {
      simulacion: armarRespuesta(guardada),
      ...(warning && { warning }),
    };
  }

  /** GET /cotizaciones/:id/prueba-choque: última simulación (404 si no hay). */
  async ultima(cotizacionId: string) {
    const s = await this.repo.ultima(cotizacionId);
    if (!s)
      throw new NotFoundException(
        'Esta cotización todavía no tiene Prueba de Choque',
      );
    return { simulacion: armarRespuesta(s) };
  }
}
