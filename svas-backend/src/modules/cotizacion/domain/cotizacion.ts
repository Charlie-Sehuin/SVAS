import type {
  MotivoAsesoria,
  OpcionVenta,
  UsoVehiculo,
} from '../../../shared/types/enums';
import type { ErrorCampo } from '../../../common/types/usuario-autenticado';
import type { CampoFormulario } from './formulario-dinamico';

/** Reglas de negocio de la cotización (contexto §5). Dominio puro: sin NestJS ni Supabase. */

// ── RN-01..04: derivación ────────────────────────────────────────────────────

export interface ReglaInspeccion {
  aseguradoraId: string;
  uso: UsoVehiculo;
  requiereInspeccion: boolean;
}

export interface Derivacion {
  opciones: OpcionVenta[];
  /** Solo la derivación del sistema deja motivo al cotizar. */
  motivo: Extract<MotivoAsesoria, 'INSPECCION' | 'NO_ASEGURABLE'> | null;
}

/**
 * - Si alguna aseguradora activa exige inspección para ese uso → solo ASESORIA
 *   (motivo INSPECCION, RN-03).
 * - Si ninguna prima quedó disponible → solo ASESORIA (NO_ASEGURABLE, RN-04).
 * - En otro caso → ambas opciones (RN-01, RN-02).
 */
export function decidirDerivacion(
  uso: UsoVehiculo,
  hayPrimaDisponible: boolean,
  reglas: readonly ReglaInspeccion[],
): Derivacion {
  if (reglas.some((r) => r.uso === uso && r.requiereInspeccion)) {
    return { opciones: ['ASESORIA'], motivo: 'INSPECCION' };
  }
  if (!hayPrimaDisponible) {
    return { opciones: ['ASESORIA'], motivo: 'NO_ASEGURABLE' };
  }
  return { opciones: ['COMPRA_INMEDIATA', 'ASESORIA'], motivo: null };
}

// ── RN-05: nicho ─────────────────────────────────────────────────────────────

export const MAXIMO_VEHICULOS = { PARTICULAR: 2, COMERCIAL: 5 } as const;

export const esComercial = (uso: UsoVehiculo) => uso !== 'PARTICULAR';

/**
 * Uso particular ≤ 2 vehículos por persona; comercial ≤ 5. Cuenta los que ya
 * tiene asegurados en el mismo grupo (particular / comercial) más este.
 * Devuelve el mensaje si queda fuera de nicho; null si puede cotizar.
 */
export function verificarNicho(
  uso: UsoVehiculo,
  yaAsegurados: { particular: number; comercial: number },
): string | null {
  if (esComercial(uso)) {
    return yaAsegurados.comercial + 1 > MAXIMO_VEHICULOS.COMERCIAL
      ? `Atendemos hasta ${MAXIMO_VEHICULOS.COMERCIAL} vehículos de uso comercial por persona. Para flotas más grandes contacta a un corredor.`
      : null;
  }
  return yaAsegurados.particular + 1 > MAXIMO_VEHICULOS.PARTICULAR
    ? `Atendemos hasta ${MAXIMO_VEHICULOS.PARTICULAR} vehículos de uso particular por persona.`
    : null;
}

// ── RF-03: validación contra el catálogo ─────────────────────────────────────

/** Valores del formulario por nombre de campo del catálogo (marca, modelo, anio, ubigeo, placa, clase…). */
export type DatosFormulario = Record<
  string,
  string | number | null | undefined
>;

/** Dónde vive cada campo del catálogo en el body de POST /cotizaciones. */
export const RUTA_CAMPO: Record<string, string> = {
  marca: 'vehiculo.marcaId',
  modelo: 'vehiculo.modeloId',
  anio: 'vehiculo.anio',
  ubigeo: 'ubicacion.ubigeo',
  placa: 'vehiculo.placa',
  clase: 'vehiculo.clase',
};

const ETIQUETA: Record<string, string> = {
  marca: 'la marca',
  modelo: 'el modelo',
  anio: 'el año',
  ubigeo: 'el distrito',
  placa: 'la placa',
  clase: 'la clase',
};

/**
 * Compara lo enviado con la unión de campos activos (RN-17): obligatorios
 * presentes y, en las listas estáticas, solo valores permitidos. Los campos
 * de catálogo (ids) se validan aparte al resolver el vehículo.
 */
export function validarContraCatalogo(
  datos: DatosFormulario,
  campos: readonly CampoFormulario[],
): ErrorCampo[] {
  const errores: ErrorCampo[] = [];
  for (const c of campos) {
    const valor = datos[c.nombre];
    const vacio =
      valor === undefined || valor === null || String(valor).trim() === '';
    const campo = RUTA_CAMPO[c.nombre] ?? c.nombre;
    if (vacio) {
      if (c.obligatorio) {
        errores.push({
          campo,
          mensaje: `Completa ${ETIQUETA[c.nombre] ?? c.nombre} (lo pide ${c.aseguradoras.join(', ')})`,
        });
      }
      continue;
    }
    if (
      c.tipo === 'LISTA' &&
      c.origenValores === 'ESTATICO' &&
      c.valoresPermitidos.length > 0 &&
      !c.valoresPermitidos.includes(String(valor))
    ) {
      errores.push({
        campo,
        mensaje: `Elige un valor válido para ${ETIQUETA[c.nombre] ?? c.nombre}: ${c.valoresPermitidos.join(', ')}`,
      });
    }
  }
  return errores;
}
