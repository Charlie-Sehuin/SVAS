import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  armarComparacion,
  LEYENDA_CONTENIDO,
  type ContenidoPlan,
} from '../domain/contenido-plan';
import {
  CONTENIDO_PLAN_REPOSITORY,
  type ContenidoPlanRepository,
} from '../domain/contenido-plan.repository.port';

const NO_DISPONIBLE = 'El contenido de este plan no está disponible';

/** CU-06: ver el detalle de un plan y comparar planes (contexto §8.7, §18.8). */
@Injectable()
export class PlanesService {
  constructor(
    @Inject(CONTENIDO_PLAN_REPOSITORY)
    private readonly repo: ContenidoPlanRepository,
  ) {}

  /** GET /planes/:planId/contenido. 404 si el plan no está activo o aún no tiene contenido. */
  async contenido(planId: string) {
    const { planes } = await this.repo.publicado();
    const p = publicado(planes.get(planId));
    return {
      planId: p.planId,
      aseguradora: p.aseguradora,
      plan: p.plan,
      resumen: p.resumen,
      descripcion: p.descripcion,
      idealPara: p.idealPara,
      coberturas: p.coberturas.map(({ orden: _orden, ...c }) => c),
      exclusiones: p.exclusiones,
      requisitos: p.requisitos,
      actualizadoEn: p.actualizadoEn,
      leyenda: LEYENDA_CONTENIDO,
    };
  }

  /** GET /planes/comparar?ids=a,b,c. El DTO ya limitó a 2–3 ids distintos. */
  async comparar(ids: string[]) {
    const { planes, catalogo } = await this.repo.publicado();
    const elegidos = ids.map((id) => publicado(planes.get(id)));
    return {
      ...armarComparacion(elegidos, catalogo),
      leyenda: LEYENDA_CONTENIDO,
    };
  }
}

function publicado(p: ContenidoPlan | undefined): ContenidoPlan {
  if (!p || !p.resumen) throw new NotFoundException(NO_DISPONIBLE);
  return p;
}
