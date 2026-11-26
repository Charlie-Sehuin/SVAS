import type { ErrorCampo } from '../../../common/types/usuario-autenticado';

/**
 * Contenido comercial de un plan (contexto §18, RN-42..RN-46): qué cubre, qué
 * no cubre, exclusiones y requisitos. No interviene en la prima.
 */

export const CATEGORIAS_COBERTURA = [
  'DANOS_PROPIOS',
  'ROBO',
  'RESPONSABILIDAD',
  'ASISTENCIA',
  'ADICIONAL',
] as const;
export type CategoriaCobertura = (typeof CATEGORIAS_COBERTURA)[number];

/** Cómo se mide un beneficio: una cantidad, un precio por unidad o un porcentaje. */
export const TIPOS_BENEFICIO = ['CANTIDAD', 'PRECIO', 'PORCENTAJE'] as const;
export type TipoBeneficio = (typeof TIPOS_BENEFICIO)[number];

export const TIPOS_REQUISITO = [
  'VEHICULO',
  'CONDUCTOR',
  'DOCUMENTO',
  'INSPECCION',
] as const;
export type TipoRequisito = (typeof TIPOS_REQUISITO)[number];

/** RN-46: toda pantalla y PDF con contenido de planes lleva esta leyenda. */
export const LEYENDA_CONTENIDO =
  'Contenido ilustrativo; no es el condicionado de la aseguradora.';

export const MAXIMO_PLANES_COMPARAR = 3;

export interface CoberturaDePlan {
  codigo: string;
  nombre: string;
  categoria: CategoriaCobertura;
  /** false = "no cubre" (fila explícita, RN-42). */
  incluida: boolean;
  detalle: string | null;
  /** Decimal como string; null si no aplica. */
  limiteMonto: string | null;
  orden: number;
}

/**
 * Beneficio extra de un plan (visitas técnicas, grúa, combustible…). Solo está
 * en la lista si el plan lo ofrece: la ausencia significa "no incluye".
 */
export interface BeneficioDePlan {
  codigo: string;
  nombre: string;
  tipo: TipoBeneficio;
  /** "al año", "USD por litro", "% de descuento"… */
  unidad: string;
  /** Decimal como string. */
  valor: string;
  detalle: string | null;
  orden: number;
}

/** "4 al año", "USD 1,00 por litro", "12 %": el valor de un beneficio como lo lee el cliente. */
export function textoBeneficio(
  b: Pick<BeneficioDePlan, 'tipo' | 'unidad' | 'valor'>,
): string {
  const n = Number(b.valor);
  if (b.tipo === 'PRECIO') {
    const precio = n.toFixed(2).replace('.', ',');
    return b.unidad.includes('USD')
      ? b.unidad.replace('USD', `USD ${precio}`)
      : `${precio} ${b.unidad}`;
  }
  const num = Number.isInteger(n) ? String(n) : b.valor.replace('.', ',');
  return b.tipo === 'PORCENTAJE' ? `${num} %` : `${num} ${b.unidad}`;
}

export interface RequisitoPlan {
  tipo: TipoRequisito;
  texto: string;
  obligatorio: boolean;
}

export interface ContenidoPlan {
  planId: string;
  aseguradora: string;
  plan: string;
  /** null mientras el plan no tenga contenido cargado. */
  resumen: string | null;
  descripcion: string | null;
  idealPara: string | null;
  /** Coberturas activas del catálogo con fila en el plan, por cobertura.orden. */
  coberturas: CoberturaDePlan[];
  exclusiones: string[];
  requisitos: RequisitoPlan[];
  /** Beneficios que el plan ofrece, por beneficio.orden. */
  beneficios: BeneficioDePlan[];
  actualizadoEn: string | null;
}

export interface CoberturaCatalogo {
  codigo: string;
  nombre: string;
  categoria: CategoriaCobertura;
  orden: number;
}

/** Lo que el administrador envía para un plan (antes de ir al RPC). */
export interface ContenidoParaValidar {
  coberturas: {
    codigo: string;
    incluida: boolean;
    limiteMonto?: number | null;
  }[];
  exclusiones: string[];
}

/**
 * Errores que impiden guardar el contenido (RN-42). Los textos obligatorios y
 * los tamaños los valida el DTO; el RPC vuelve a revisar todo. Las
 * contradicciones con la Prueba de Choque (RN-43) no son errores: son
 * advertencias que calcula la base al guardar.
 */
export function validarContenidoPlan(
  c: ContenidoParaValidar,
  codigosActivos: readonly string[],
): ErrorCampo[] {
  const errores: ErrorCampo[] = [];
  const activos = new Set(codigosActivos);
  const vistos = new Set<string>();

  c.coberturas.forEach((cob, i) => {
    if (!activos.has(cob.codigo)) {
      errores.push({
        campo: `coberturas.${i}.codigo`,
        mensaje: `La cobertura ${cob.codigo} no existe o está inactiva`,
      });
    } else if (vistos.has(cob.codigo)) {
      errores.push({
        campo: `coberturas.${i}.codigo`,
        mensaje: `La cobertura ${cob.codigo} está repetida`,
      });
    }
    vistos.add(cob.codigo);
    if (!cob.incluida && cob.limiteMonto != null) {
      errores.push({
        campo: `coberturas.${i}.limiteMonto`,
        mensaje: 'Una cobertura que el plan no incluye no lleva límite',
      });
    }
  });

  // RN-42: "no cubre" es una fila con incluida = false, nunca una ausencia.
  const faltantes = codigosActivos.filter((codigo) => !vistos.has(codigo));
  if (faltantes.length) {
    errores.push({
      campo: 'coberturas',
      mensaje: `Faltan coberturas por definir (sí o no): ${faltantes.join(', ')}`,
    });
  }

  const textos = new Set<string>();
  c.exclusiones.forEach((x, i) => {
    const t = x.trim();
    if (textos.has(t)) {
      errores.push({
        campo: `exclusiones.${i}`,
        mensaje: 'Hay exclusiones repetidas',
      });
    }
    textos.add(t);
  });

  return errores;
}

export interface Comparacion {
  planes: {
    planId: string;
    aseguradora: string;
    plan: string;
    resumen: string | null;
  }[];
  filas: {
    codigo: string;
    nombre: string;
    categoria: CategoriaCobertura;
    /** valores[i] corresponde a planes[i]; null si el plan no tiene la fila. */
    valores: ({ incluida: boolean; detalle: string | null } | null)[];
  }[];
  /**
   * Beneficios que ofrece al menos uno de los planes comparados. Un plan que no
   * lo ofrece lleva null ("No incluye").
   */
  beneficios: {
    codigo: string;
    nombre: string;
    tipo: TipoBeneficio;
    unidad: string;
    valores: ({ valor: string; detalle: string | null } | null)[];
  }[];
}

/**
 * Matriz cobertura × plan (§18.4). Las filas salen en el orden del catálogo,
 * igual para todos los planes, para que el frontend no reordene nada.
 */
export function armarComparacion(
  planes: ContenidoPlan[],
  catalogo: CoberturaCatalogo[],
): Comparacion {
  const porPlan = planes.map(
    (p) => new Map(p.coberturas.map((c) => [c.codigo, c])),
  );
  const beneficios = new Map<string, BeneficioDePlan>();
  for (const p of planes) {
    for (const b of p.beneficios)
      if (!beneficios.has(b.codigo)) beneficios.set(b.codigo, b);
  }
  const beneficiosPorPlan = planes.map(
    (p) => new Map(p.beneficios.map((b) => [b.codigo, b])),
  );
  return {
    planes: planes.map((p) => ({
      planId: p.planId,
      aseguradora: p.aseguradora,
      plan: p.plan,
      resumen: p.resumen,
    })),
    beneficios: [...beneficios.values()]
      .sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo))
      .map((b) => ({
        codigo: b.codigo,
        nombre: b.nombre,
        tipo: b.tipo,
        unidad: b.unidad,
        valores: beneficiosPorPlan.map((m) => {
          const x = m.get(b.codigo);
          return x ? { valor: x.valor, detalle: x.detalle } : null;
        }),
      })),
    filas: [...catalogo]
      .sort((a, b) => a.orden - b.orden)
      .map((cob) => ({
        codigo: cob.codigo,
        nombre: cob.nombre,
        categoria: cob.categoria,
        valores: porPlan.map((m) => {
          const c = m.get(cob.codigo);
          return c ? { incluida: c.incluida, detalle: c.detalle } : null;
        }),
      })),
  };
}
