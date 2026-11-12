import Decimal from 'decimal.js';
import type { TipoCampo, UsoVehiculo } from '../../../shared/types/enums';

/** Catálogo que administra el ADMINISTRADOR (contexto §4.1, D1). */
export interface Aseguradora {
  id: string;
  nombre: string;
  activa: boolean;
  codigoEstrategia: string;
}

export interface Plan {
  id: string;
  aseguradoraId: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export const ORIGENES_VALORES = ['ESTATICO', 'CATALOGO'] as const;
export type OrigenValores = (typeof ORIGENES_VALORES)[number];

/** Campos cuyas opciones salen de las tablas de vehículos/ubigeos (D7). */
export const CAMPOS_DE_CATALOGO = [
  'marca',
  'modelo',
  'anio',
  'ubigeo',
  'tipo',
] as const;

export interface Campo {
  id: string;
  aseguradoraId: string;
  nombre: string;
  tipo: TipoCampo;
  obligatorio: boolean;
  activo: boolean;
  origenValores: OrigenValores;
  valores: string[];
}

export interface ReglaInspeccion {
  aseguradoraId: string;
  uso: UsoVehiculo;
  requiereInspeccion: boolean;
}

/** Porcentajes y tipo de cambio como string decimal (nunca float). */
export interface ParametrosComerciales {
  descuentoPrimeraCompra: string;
  descuentoMaximo: string;
  maxIntentos: number;
  diasSeguimiento: number;
  maxCuotas: number;
  vigenciaEnlaceDias: number;
  horasAbandono: number;
  moneda: string;
  tipoCambioReferencial: string;
}

export interface EntradaBitacora {
  id: string;
  usuarioId: string | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  detalle: unknown;
  fecha: string;
}

export interface DatosCampo {
  nombre: string;
  tipo: TipoCampo;
  origenValores: OrigenValores;
  valores: string[];
}

/**
 * Reglas del formulario dinámico (RN-17). El RPC admin_guardar_campo las
 * vuelve a validar; aquí se validan antes para responder con mensajes por campo.
 */
export function validarCampo(c: DatosCampo): string[] {
  const errores: string[] = [];
  const conValores = c.valores.length > 0;

  if (c.origenValores === 'CATALOGO') {
    if (
      c.tipo !== 'LISTA' ||
      !(CAMPOS_DE_CATALOGO as readonly string[]).includes(c.nombre)
    ) {
      errores.push(
        'Solo marca, modelo, anio, ubigeo y tipo pueden tomar sus opciones del catálogo (tipo LISTA)',
      );
    }
    if (conValores) {
      errores.push('Un campo con origen CATALOGO no lleva valores permitidos');
    }
  } else if (c.tipo === 'LISTA' && !conValores) {
    errores.push('Un campo de tipo lista necesita al menos un valor permitido');
  } else if (c.tipo !== 'LISTA' && conValores) {
    errores.push('Solo los campos de tipo lista llevan valores permitidos');
  }
  return errores;
}

/** Quita espacios y duplicados, conserva el orden de ingreso. */
export function normalizarValores(valores: readonly string[]): string[] {
  return [...new Set(valores.map((v) => v.trim()).filter((v) => v !== ''))];
}

/**
 * ck_parametros_descuentos: 0 < primera compra ≤ máximo ≤ 100 (RN-07, RN-08).
 * Se valida sobre el resultado final (lo vigente + los cambios).
 */
export function validarDescuentos(p: {
  descuentoPrimeraCompra: Decimal.Value;
  descuentoMaximo: Decimal.Value;
}): string[] {
  const primera = new Decimal(p.descuentoPrimeraCompra);
  const maximo = new Decimal(p.descuentoMaximo);
  const errores: string[] = [];
  if (primera.lte(0)) {
    errores.push('El descuento de primera compra debe ser mayor que 0');
  }
  if (primera.gt(maximo)) {
    errores.push(
      'El descuento de primera compra no puede superar el descuento máximo',
    );
  }
  if (maximo.gt(100)) {
    errores.push('El descuento máximo no puede superar el 100 %');
  }
  return errores;
}
