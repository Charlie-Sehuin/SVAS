import type { TipoCampo } from '../../../shared/types/enums';

/** Campo activo de una aseguradora activa, tal como sale del catálogo. */
export interface CampoAseguradora {
  aseguradora: string;
  nombre: string;
  tipo: TipoCampo;
  obligatorio: boolean;
  origenValores: 'ESTATICO' | 'CATALOGO';
  valores: string[];
}

export interface CampoFormulario {
  nombre: string;
  tipo: TipoCampo;
  obligatorio: boolean;
  origenValores: 'ESTATICO' | 'CATALOGO';
  valoresPermitidos: string[];
  /** Aseguradoras que piden este campo (para el mensaje "Pacífico necesita…"). */
  aseguradoras: string[];
}

/** `tipo` no se pregunta: el backend lo deduce del modelo (contexto §4.1). */
const NO_SE_PREGUNTAN = new Set(['tipo']);
/** Orden natural del formulario; el resto va después, alfabético. */
const ORDEN = ['marca', 'modelo', 'anio', 'ubigeo'];

/**
 * RN-17: el formulario es la UNIÓN de los campos activos de las aseguradoras
 * activas. Si una lo exige, es obligatorio; los valores permitidos se suman.
 */
export function unirCampos(
  campos: readonly CampoAseguradora[],
): CampoFormulario[] {
  const porNombre = new Map<string, CampoFormulario>();
  for (const c of campos) {
    if (NO_SE_PREGUNTAN.has(c.nombre)) continue;
    const previo = porNombre.get(c.nombre);
    if (!previo) {
      porNombre.set(c.nombre, {
        nombre: c.nombre,
        tipo: c.tipo,
        obligatorio: c.obligatorio,
        origenValores: c.origenValores,
        valoresPermitidos: c.origenValores === 'CATALOGO' ? [] : [...c.valores],
        aseguradoras: [c.aseguradora],
      });
      continue;
    }
    previo.obligatorio ||= c.obligatorio;
    previo.aseguradoras.push(c.aseguradora);
    if (previo.origenValores === 'ESTATICO') {
      previo.valoresPermitidos = [
        ...new Set([...previo.valoresPermitidos, ...c.valores]),
      ];
    }
  }
  const posicion = (n: string) =>
    ORDEN.includes(n) ? ORDEN.indexOf(n) : ORDEN.length;
  return [...porNombre.values()]
    .map((c) => ({
      ...c,
      valoresPermitidos: [...c.valoresPermitidos].sort((a, b) =>
        a.localeCompare(b, 'es'),
      ),
      aseguradoras: [...c.aseguradoras].sort((a, b) =>
        a.localeCompare(b, 'es'),
      ),
    }))
    .sort(
      (a, b) =>
        posicion(a.nombre) - posicion(b.nombre) ||
        a.nombre.localeCompare(b.nombre),
    );
}
