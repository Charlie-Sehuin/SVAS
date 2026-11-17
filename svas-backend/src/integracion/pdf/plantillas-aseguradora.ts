/**
 * Aspecto de la póliza en PDF según la aseguradora: un diseño de encabezado y
 * el logo y el color de la marca. Sigue siendo un documento de demostración
 * (RNF-20).
 */
export type Diseno = 'BANDA' | 'LATERAL' | 'DOBLE_LINEA' | 'BLOQUE' | 'MINIMAL';

export interface Entidad {
  razonSocial: string;
  ruc: string | null;
  domicilio: string | null;
}

export interface PlantillaAseguradora extends Entidad {
  diseno: Diseno;
  /** Archivo en ./logos, o null si no hay logo. */
  logo: string | null;
  /** Color principal (hex), tomado del logo. */
  color: string;
  /** Tono muy claro del mismo color, para fondos. */
  colorSuave: string;
}

// ruc y domicilio quedan en null hasta confirmarlos: no se inventan.
export const CORREDOR_SEGUROSIMPLE: Entidad = {
  // Tal como figura en el logo; la razón social exacta de Ategia queda por confirmar.
  razonSocial:
    'SeguroSimple.com, con el respaldo de Ategia Corredores de Seguros',
  ruc: null,
  domicilio: null,
};

/** Logo del corredor (archivo en ./logos). */
export const LOGO_CORREDOR = 'segurosimple.png';

/** La clave es el nombre de la aseguradora sin tildes y en minúsculas. */
const PLANTILLAS: Record<string, PlantillaAseguradora> = {
  rimac: {
    razonSocial: 'Rímac Seguros y Reaseguros',
    ruc: null,
    domicilio: null,
    diseno: 'BANDA',
    logo: 'rimac.png',
    color: '#e00109',
    colorSuave: '#fde8e9',
  },
  pacifico: {
    razonSocial: 'Pacífico Compañía de Seguros y Reaseguros S.A.',
    ruc: null,
    domicilio: null,
    diseno: 'LATERAL',
    logo: 'pacifico.png',
    color: '#0198cf',
    colorSuave: '#e5f4fa',
  },
  'la positiva': {
    razonSocial: 'La Positiva Seguros y Reaseguros S.A.A.',
    ruc: null,
    domicilio: null,
    diseno: 'DOBLE_LINEA',
    logo: 'la-positiva.png',
    color: '#fe6b37',
    colorSuave: '#fff0ea',
  },
  mapfre: {
    razonSocial: 'Mapfre Perú Compañía de Seguros y Reaseguros S.A.',
    ruc: null,
    domicilio: null,
    diseno: 'BLOQUE',
    logo: 'mapfre.png',
    color: '#fd0021',
    colorSuave: '#ffe8eb',
  },
  qualitas: {
    razonSocial: 'Qualitas Compañía de Seguros S.A.',
    ruc: null,
    domicilio: null,
    diseno: 'MINIMAL',
    logo: 'qualitas.png',
    color: '#8f0480',
    colorSuave: '#f5e6f3',
  },
};

const normalizar = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Plantilla de la aseguradora (ignora tildes y mayúsculas); si no se conoce, una neutra. */
export function plantillaDe(nombreAseguradora: string): PlantillaAseguradora {
  return (
    PLANTILLAS[normalizar(nombreAseguradora)] ?? {
      razonSocial: nombreAseguradora,
      ruc: null,
      domicilio: null,
      diseno: 'MINIMAL',
      logo: null,
      color: '#323f4b',
      colorSuave: '#eef0f2',
    }
  );
}
