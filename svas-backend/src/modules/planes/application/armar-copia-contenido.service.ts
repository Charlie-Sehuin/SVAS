import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ContenidoPlan } from '../domain/contenido-plan';
import {
  CONTENIDO_PLAN_REPOSITORY,
  type ContenidoPlanRepository,
} from '../domain/contenido-plan.repository.port';

/** Doc conexión §8: 409 CONTENIDO_PLAN_INCOMPLETO al comprar. */
export const CONTENIDO_PLAN_INCOMPLETO =
  'El contenido de este plan está incompleto; por ahora no se puede comprar';

/**
 * RN-45 "lo que el cliente vio es lo que contrató": arma la copia del
 * contenido del plan que crear_orden_compra guarda en la orden y de la que
 * sale el PDF. Lee el contenido sin caché (comprar es poco frecuente y la
 * copia no puede quedar desactualizada aunque otro proceso lo haya editado).
 */
@Injectable()
export class ArmarCopiaContenidoService {
  constructor(
    @Inject(CONTENIDO_PLAN_REPOSITORY)
    private readonly repo: ContenidoPlanRepository,
  ) {}

  async armar(planId: string): Promise<ContenidoPlan> {
    this.repo.invalidar();
    const { planes, catalogo } = await this.repo.publicado();
    const p = planes.get(planId);
    const definidas = new Set(p?.coberturas.map((c) => c.codigo));
    if (
      !p ||
      !p.resumen ||
      catalogo.some((c) => !definidas.has(c.codigo)) // RN-42
    ) {
      throw new ConflictException(CONTENIDO_PLAN_INCOMPLETO);
    }
    return p;
  }
}
