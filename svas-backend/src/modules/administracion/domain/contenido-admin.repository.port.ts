import type {
  CoberturaAdminVista,
  CoberturaParaGuardar,
  CompletitudPlan,
  ContenidoAdminBase,
  ContenidoParaGuardar,
  Incoherencia,
} from './contenido-admin';

/**
 * Contenido de planes con el JWT del administrador: lecturas por RLS y la
 * vista v_plan_contenido_completitud; escrituras por los RPC de 0030.
 */
export interface ContenidoAdminRepository {
  obtener(token: string, planId: string): Promise<ContenidoAdminBase | null>;
  incoherencias(token: string, planId: string): Promise<Incoherencia[]>;
  completitud(token: string, planId?: string): Promise<CompletitudPlan[]>;
  guardar(
    token: string,
    planId: string,
    c: ContenidoParaGuardar,
  ): Promise<{ cambio: boolean; advertencias: Incoherencia[] }>;

  listarCoberturas(token: string): Promise<CoberturaAdminVista[]>;
  guardarCobertura(
    token: string,
    codigo: string,
    c: CoberturaParaGuardar,
  ): Promise<CoberturaAdminVista & { planesSinDefinir: number }>;
}

export const CONTENIDO_ADMIN_REPOSITORY = Symbol('CONTENIDO_ADMIN_REPOSITORY');
