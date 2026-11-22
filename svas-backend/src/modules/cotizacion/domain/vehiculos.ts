import type {
  EstadoCotizacion,
  UsoVehiculo,
} from '../../../shared/types/enums';

/** Un vehículo tal como está en la base: hay una fila por cada vez que se cotizó. */
export interface VehiculoRegistrado {
  id: string;
  anio: number;
  placa: string | null;
  clase: string | null;
  uso: UsoVehiculo;
  creadoEn: string;
  marca: { id: string; nombre: string };
  modelo: { id: string; nombre: string };
  ubicacion: {
    ubigeo: string;
    departamento: string;
    provincia: string;
    distrito: string;
  } | null;
  cotizaciones: { id: string; fecha: string; estado: EstadoCotizacion }[];
}

/**
 * Un auto de la persona ("Mis vehículos"). Si cotizó el mismo auto varias veces (misma marca, modelo, año y placa) sale
 * UNA vez, con los datos de la cotización más reciente. Sirve para no volver a escribirlos al cotizar de nuevo.
 */
export interface VehiculoGuardado {
  /** Identifica al auto entre cotizaciones; no es un id de la base. */
  clave: string;
  marca: { id: string; nombre: string };
  modelo: { id: string; nombre: string };
  anio: number;
  placa: string | null;
  clase: string | null;
  uso: UsoVehiculo;
  ubicacion: VehiculoRegistrado['ubicacion'];
  /** Cuántas veces se cotizó. */
  cotizaciones: number;
  ultimaCotizacion: string;
  /** Tiene al menos una cotización convertida en póliza. */
  asegurado: boolean;
}

/** La placa sin guion ni mayúsculas: "abc-123" y "ABC123" son el mismo auto. */
const placaNormalizada = (placa: string | null) =>
  (placa ?? '').replace(/[\s-]/g, '').toUpperCase();

export function claveVehiculo(
  v: Pick<VehiculoRegistrado, 'modelo' | 'anio' | 'placa'>,
): string {
  return `${v.modelo.id}|${v.anio}|${placaNormalizada(v.placa)}`;
}

/** Junta las filas del mismo auto y deja primero el que se cotizó más recientemente. */
export function agruparVehiculos(
  filas: VehiculoRegistrado[],
): VehiculoGuardado[] {
  const grupos = new Map<string, VehiculoRegistrado[]>();
  for (const f of filas) {
    const clave = claveVehiculo(f);
    grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
  }

  return [...grupos.entries()]
    .map(([clave, grupo]) => {
      // Los datos del auto (uso, clase, ubicación) son los de la fila más reciente.
      const reciente = [...grupo].sort((a, b) =>
        b.creadoEn.localeCompare(a.creadoEn),
      )[0]!;
      const cotizaciones = grupo.flatMap((g) => g.cotizaciones);
      const fechas = cotizaciones.map((c) => c.fecha).sort();
      return {
        clave,
        marca: reciente.marca,
        modelo: reciente.modelo,
        anio: reciente.anio,
        placa: reciente.placa,
        clase: reciente.clase,
        uso: reciente.uso,
        ubicacion: reciente.ubicacion,
        cotizaciones: cotizaciones.length,
        ultimaCotizacion: fechas[fechas.length - 1] ?? reciente.creadoEn,
        asegurado: cotizaciones.some((c) => c.estado === 'CONVERTIDA'),
      };
    })
    .sort((a, b) => b.ultimaCotizacion.localeCompare(a.ultimaCotizacion));
}
