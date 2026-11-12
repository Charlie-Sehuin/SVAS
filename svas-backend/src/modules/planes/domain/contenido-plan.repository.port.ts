import type { CoberturaCatalogo, ContenidoPlan } from './contenido-plan';

export interface ContenidoPublicado {
  /** Contenido de los planes activos de aseguradoras activas, por planId. */
  planes: Map<string, ContenidoPlan>;
  /** Coberturas activas del catálogo. */
  catalogo: CoberturaCatalogo[];
}

/**
 * Lectura pública del contenido (RN-46). El visitante sin sesión no tiene JWT,
 * así que se lee con service_role, solo en lectura (arquitectura §4.2).
 * Caché de 5 min; el administrador la invalida al guardar.
 */
export interface ContenidoPlanRepository {
  publicado(): Promise<ContenidoPublicado>;
  invalidar(): void;
}

export const CONTENIDO_PLAN_REPOSITORY = Symbol('CONTENIDO_PLAN_REPOSITORY');

/** Lo que el cotizador necesita: la frase de venta de cada plan. */
export interface ResumenPlanes {
  resumenes(planIds: string[]): Promise<Map<string, string | null>>;
}

export const RESUMEN_PLANES = Symbol('RESUMEN_PLANES');
