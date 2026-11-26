import type {
  CategoriaCobertura,
  RequisitoPlan,
  TipoBeneficio,
  TipoRequisito,
} from '../../planes/domain/contenido-plan';

/** Contenido de un plan visto por el administrador (contexto §18, RN-42/43). */

export interface CoberturaDePlanAdmin {
  codigo: string;
  nombre: string;
  categoria: CategoriaCobertura;
  /** false = el plan aún no tiene fila para esta cobertura activa (RN-42). */
  definida: boolean;
  incluida: boolean | null;
  detalle: string | null;
  limiteMonto: string | null;
}

export interface ContenidoAdminBase {
  planId: string;
  aseguradora: string;
  plan: string;
  activo: boolean;
  resumen: string | null;
  descripcion: string | null;
  idealPara: string | null;
  /** Todas las coberturas activas del catálogo, por orden. */
  coberturas: CoberturaDePlanAdmin[];
  exclusiones: string[];
  requisitos: RequisitoPlan[];
  contenidoActualizadoEn: string | null;
}

export interface CompletitudPlan {
  planId: string;
  aseguradora: string;
  plan: string;
  activo: boolean;
  coberturasFaltantes: number;
  tieneResumen: boolean;
  tieneDescripcion: boolean;
  tieneIdealPara: boolean;
  nRequisitos: number;
  nExclusiones: number;
  incoherenciasPruebaChoque: number;
  completo: boolean;
  contenidoActualizadoEn: string | null;
}

/** Fila de svas.fn_incoherencias_plan (RN-43). */
export interface Incoherencia {
  codigo: string;
  nombre: string;
  incluida: boolean;
  escenariosQueCubren: string[];
}

export interface AdvertenciaContenido extends Incoherencia {
  mensaje: string;
}

export interface ContenidoParaGuardar {
  resumen: string;
  descripcion: string;
  idealPara: string;
  coberturas: {
    codigo: string;
    incluida: boolean;
    detalle?: string | null;
    limiteMonto?: number | null;
  }[];
  exclusiones: string[];
  requisitos: { tipo: TipoRequisito; texto: string; obligatorio?: boolean }[];
}

export interface CoberturaAdminVista {
  id: string;
  codigo: string;
  nombre: string;
  categoria: CategoriaCobertura;
  descripcion: string;
  orden: number;
  activa: boolean;
  /** Escenarios de la Prueba de Choque ligados (RN-43). */
  escenarios: string[];
}

export interface CoberturaParaGuardar {
  nombre: string;
  categoria: CategoriaCobertura;
  descripcion: string;
  orden: number;
  activa: boolean;
  escenarios: string[];
}

/** Texto para la pantalla del admin (contexto §14, fila RN-43). */
export function aAdvertencia(i: Incoherencia): AdvertenciaContenido {
  const mensaje = i.incluida
    ? `«${i.nombre}» dice que sí, pero la Prueba de Choque dice que no. Corrige una de las dos.`
    : `«${i.nombre}» dice que no, pero la Prueba de Choque la cubre en ${i.escenariosQueCubren.join(', ')}. Corrige una de las dos.`;
  return { ...i, mensaje };
}

// ── Beneficios de los planes (0042) ─────────────────────────────────────────
export interface BeneficioCatalogoAdmin {
  codigo: string;
  nombre: string;
  tipo: TipoBeneficio;
  unidad: string;
  orden: number;
}

export interface BeneficioDePlanAdmin extends BeneficioCatalogoAdmin {
  /** Decimal como string. */
  valor: string;
  detalle: string | null;
}

export interface BeneficioParaGuardar {
  codigo: string;
  valor: number;
  detalle?: string | null;
}

/** Fila de svas.fn_incoherencias_escalera: el plan superior no cumple lo del inferior. */
export interface IncoherenciaEscalera {
  codigo: string;
  nombre: string;
  planBajo: string;
  planAlto: string;
  motivo: string;
}

export interface BeneficiosPlanAdmin {
  planId: string;
  aseguradora: string;
  plan: string;
  /** Solo los que el plan ofrece. */
  beneficios: BeneficioDePlanAdmin[];
  /** Todos los beneficios activos que se pueden asignar. */
  catalogo: BeneficioCatalogoAdmin[];
  advertencias: (IncoherenciaEscalera & { mensaje: string })[];
}

export function aAdvertenciaEscalera(
  i: IncoherenciaEscalera,
): IncoherenciaEscalera & { mensaje: string } {
  return {
    ...i,
    mensaje: `«${i.nombre}»: ${i.motivo} (${i.planBajo} → ${i.planAlto}). Un plan superior debe incluir todo lo del inferior, con igual o mejor valor.`,
  };
}
