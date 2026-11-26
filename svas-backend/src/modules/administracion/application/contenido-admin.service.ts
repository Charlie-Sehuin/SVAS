import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { validarContenidoPlan } from '../../planes/domain/contenido-plan';
import {
  CONTENIDO_PLAN_REPOSITORY,
  type ContenidoPlanRepository,
} from '../../planes/domain/contenido-plan.repository.port';
import {
  aAdvertencia,
  aAdvertenciaEscalera,
  type AdvertenciaContenido,
  type BeneficioParaGuardar,
  type BeneficiosPlanAdmin,
  type CoberturaParaGuardar,
  type ContenidoParaGuardar,
} from '../domain/contenido-admin';
import {
  CONTENIDO_ADMIN_REPOSITORY,
  type ContenidoAdminRepository,
} from '../domain/contenido-admin.repository.port';

export const WARNING_CONTENIDO_INCOHERENTE = 'CONTENIDO_INCOHERENTE';

function warningIncoherente(advertencias: AdvertenciaContenido[]) {
  if (!advertencias.length) return undefined;
  const n = advertencias.length;
  return {
    code: WARNING_CONTENIDO_INCOHERENTE,
    message:
      n === 1
        ? advertencias[0].mensaje
        : `${n} coberturas contradicen a la Prueba de Choque. Revisa la lista de advertencias.`,
  };
}

/**
 * Contenido comercial de los planes (contexto §6.12, §18.8, RN-42..46).
 * Errores (RN-42) impiden guardar; contradicciones con la Prueba de Choque
 * (RN-43) se guardan igual y vuelven como `warning`.
 */
@Injectable()
export class ContenidoAdminService {
  constructor(
    @Inject(CONTENIDO_ADMIN_REPOSITORY)
    private readonly repo: ContenidoAdminRepository,
    @Inject(CONTENIDO_PLAN_REPOSITORY)
    private readonly publicado: Pick<ContenidoPlanRepository, 'invalidar'>,
  ) {}

  /** GET /admin/planes/:planId/contenido: contenido + completitud + advertencias. */
  async obtener(token: string, planId: string) {
    const [base, completitud, incoherencias] = await Promise.all([
      this.repo.obtener(token, planId),
      this.repo.completitud(token, planId),
      this.repo.incoherencias(token, planId),
    ]);
    if (!base) throw new NotFoundException('El plan no existe');
    return {
      ...base,
      completitud: completitud[0] ?? null,
      advertencias: incoherencias.map(aAdvertencia),
    };
  }

  /** PUT /admin/planes/:planId/contenido: reemplaza todo en una transacción. */
  async guardar(token: string, planId: string, c: ContenidoParaGuardar) {
    const activas = (await this.repo.listarCoberturas(token))
      .filter((x) => x.activa)
      .map((x) => x.codigo);
    const errores = validarContenidoPlan(c, activas);
    if (errores.length) {
      throw new BadRequestException({
        message: errores[0].mensaje,
        errors: errores,
      });
    }

    const r = await this.repo.guardar(token, planId, c);
    this.publicado.invalidar();
    const advertencias = r.advertencias.map(aAdvertencia);
    const contenido = await this.obtener(token, planId);
    const warning = warningIncoherente(advertencias);
    return {
      ...contenido,
      cambio: r.cambio,
      advertencias,
      ...(warning && { warning }),
    };
  }

  // ── Beneficios de un plan (0042) ──────────────────────────────────────────
  /** GET /admin/planes/:planId/beneficios: lo que ofrece el plan, el catálogo y las advertencias de escalera. */
  async obtenerBeneficios(
    token: string,
    planId: string,
  ): Promise<BeneficiosPlanAdmin> {
    const r = await this.repo.obtenerBeneficios(token, planId);
    if (!r) throw new NotFoundException('El plan no existe');
    return {
      planId,
      aseguradora: r.aseguradora,
      plan: r.plan,
      beneficios: r.beneficios,
      catalogo: r.catalogo,
      advertencias: r.advertencias.map(aAdvertenciaEscalera),
    };
  }

  /**
   * PUT /admin/planes/:planId/beneficios: reemplaza los beneficios del plan en una
   * transacción. Que el plan superior no iguale al inferior no impide guardar:
   * se avisa (igual que RN-43 con las coberturas).
   */
  async guardarBeneficios(
    token: string,
    planId: string,
    beneficios: BeneficioParaGuardar[],
  ) {
    const r = await this.repo.guardarBeneficios(token, planId, beneficios);
    this.publicado.invalidar();
    const contenido = await this.obtenerBeneficios(token, planId);
    const n = r.advertencias.length;
    return {
      ...contenido,
      cambio: r.cambio,
      ...(n > 0 && {
        warning: {
          code: 'BENEFICIOS_FUERA_DE_ESCALERA',
          message:
            n === 1
              ? contenido.advertencias[0].mensaje
              : `${n} beneficios no cumplen que el plan superior incluya todo lo del inferior. Revisa la lista de advertencias.`,
        },
      }),
    };
  }

  // ── Catálogo de coberturas ────────────────────────────────────────────────
  listarCoberturas(token: string) {
    return this.repo.listarCoberturas(token);
  }

  /** Crea la cobertura si el código no existe; si existe, la reemplaza. */
  async guardarCobertura(
    token: string,
    codigo: string,
    c: CoberturaParaGuardar,
  ) {
    const r = await this.repo.guardarCobertura(token, codigo, c);
    this.publicado.invalidar();
    return r;
  }

  // ── Completitud (§18.10) ──────────────────────────────────────────────────
  async completitud(token: string) {
    const items = await this.repo.completitud(token);
    const activos = items.filter((i) => i.activo);
    return {
      completo: activos.every((i) => i.completo),
      planesActivosIncompletos: activos.filter((i) => !i.completo).length,
      items,
    };
  }
}
