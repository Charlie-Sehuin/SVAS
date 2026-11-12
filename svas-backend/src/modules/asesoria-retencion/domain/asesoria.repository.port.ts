import type {
  CanalContacto,
  EstadoCotizacion,
  EstadoSeguimiento,
  EstadoSolicitud,
  MotivoAsesoria,
  MotivoCierre,
  OrigenCaso,
  ResultadoIntento,
  TipoDescuento,
} from '../../../shared/types/enums';

/** Montos y porcentajes viajan como string decimal ("640.40"), nunca float. */
export interface CotizacionDelCaso {
  id: string;
  fecha: string;
  estado: EstadoCotizacion;
  vehiculo: string; // "Toyota Corolla 2022"
}

export interface ContactoDelCaso {
  nombres: string;
  apellidos: string;
  telefono: string;
  email: string;
  canalPreferido: CanalContacto;
  numeroDocumento: string | null;
}

export interface PrimaDelCaso {
  planId: string;
  plan: string;
  aseguradora: string;
  disponible: boolean;
  sumaAsegurada: string | null;
  prima: string | null;
  primaMensual: string | null;
}

export interface DescuentoDelCaso {
  id: string;
  planId: string;
  tipo: TipoDescuento;
  porcentaje: string;
  aceptado: boolean;
  fecha: string;
}

export interface Solicitud {
  id: string;
  motivo: MotivoAsesoria;
  estado: EstadoSolicitud;
  canal: CanalContacto;
  origen: OrigenCaso;
  fechaCreacion: string;
  asesorId: string | null;
  resultado: string | null;
  cotizacion: CotizacionDelCaso;
  cliente: ContactoDelCaso;
}

export interface SolicitudDetalle extends Solicitud {
  primas: PrimaDelCaso[];
  descuentos: DescuentoDelCaso[];
}

export interface IntentoDeContacto {
  id: string;
  canal: CanalContacto;
  resultado: ResultadoIntento;
  fecha: string;
  asesorId: string;
}

export interface Seguimiento {
  id: string;
  estado: EstadoSeguimiento;
  intentos: number;
  fechaApertura: string;
  fechaCierre: string | null;
  motivoCierre: MotivoCierre | null;
  cotizacion: CotizacionDelCaso;
  cliente: ContactoDelCaso;
}

export interface SeguimientoDetalle extends Seguimiento {
  historial: IntentoDeContacto[];
  primas: PrimaDelCaso[];
  descuentos: DescuentoDelCaso[];
}

/**
 * A quién y con qué enlace avisar. `enlaceToken` es el token de retoma EN
 * CLARO (sale una sola vez del RPC): va solo al notificador, nunca a la respuesta.
 */
export interface AvisoCliente {
  seguimientoId: string;
  cotizacionId: string;
  nombres: string;
  canal: CanalContacto;
  telefono: string;
  enlaceToken: string | null;
}

export interface CierreSeguimiento extends AvisoCliente {
  estado: EstadoSeguimiento;
  motivo: MotivoCierre | null;
}

export interface ParametrosRetencion {
  descuentoMaximo: string;
  maxIntentos: number;
  diasSeguimiento: number;
}

/**
 * Asesoría y retención (0024/0025). Los métodos con `accessToken` corren como
 * ese usuario (RLS y RPC con auth.uid()); los jobs y la retoma, como service_role.
 */
export interface AsesoriaRepository {
  solicitar(
    accessToken: string,
    d: { cotizacionId: string; motivo: MotivoAsesoria; canal: CanalContacto },
  ): Promise<
    Pick<
      Solicitud,
      'id' | 'motivo' | 'estado' | 'canal' | 'origen' | 'fechaCreacion'
    >
  >;
  /** Cola RN-13: SISTEMA antes que CLIENTE, por antigüedad. Sin estado: las abiertas. */
  listarCola(
    accessToken: string,
    f: { estado?: EstadoSolicitud; origen?: OrigenCaso },
  ): Promise<Solicitud[]>;
  obtenerSolicitud(
    accessToken: string,
    id: string,
  ): Promise<SolicitudDetalle | null>;
  tomar(
    accessToken: string,
    id: string,
  ): Promise<{ id: string; estado: EstadoSolicitud }>;
  aplicarDescuento(
    accessToken: string,
    id: string,
    planId: string,
    porcentaje: string,
  ): Promise<DescuentoDelCaso>;
  cerrarSolicitud(
    accessToken: string,
    id: string,
    resultado: string,
    acepta: boolean,
  ): Promise<{
    id: string;
    estado: EstadoSolicitud;
    resultado: string;
    acepta: boolean;
  }>;

  /** Sin estado: los EN_SEGUIMIENTO, del más antiguo al más nuevo. */
  listarSeguimientos(
    accessToken: string,
    estado?: EstadoSeguimiento,
  ): Promise<Seguimiento[]>;
  obtenerSeguimiento(
    accessToken: string,
    id: string,
  ): Promise<SeguimientoDetalle | null>;
  registrarIntento(
    accessToken: string,
    id: string,
    canal: CanalContacto,
    resultado: ResultadoIntento,
  ): Promise<{
    intentos: number;
    maxIntentos: number;
    cierre: CierreSeguimiento | null;
  }>;
  enviarEnlaceCompra(accessToken: string, id: string): Promise<AvisoCliente>;
  cerrarSeguimiento(
    accessToken: string,
    id: string,
    estado: EstadoSeguimiento,
    motivo: MotivoCierre | null,
  ): Promise<CierreSeguimiento>;
  parametros(accessToken: string): Promise<ParametrosRetencion>;

  /** RPC 6.10 (service_role). Devuelve cuántos seguimientos abrió. */
  detectarAbandonadas(): Promise<number>;
  /** Cierra los vencidos (service_role) y devuelve a quién avisar. */
  caducarSeguimientos(): Promise<CierreSeguimiento[]>;
  /** 0037 (service_role): el mensaje final salió; si llevó la frase RN-35 (reporte §16.7). */
  registrarMensajeFinal(
    seguimientoId: string,
    incluyeRn35: boolean,
  ): Promise<void>;
  /** RPC 6.11 (service_role): un solo uso; reemplaza el token de acceso de la cotización. */
  resolverRetoma(
    tokenHash: string,
    nuevoTokenHash: string,
  ): Promise<{
    cotizacionId: string;
    descuento: { tipo: TipoDescuento; porcentaje: string };
  }>;
}

export const ASESORIA_REPOSITORY = Symbol('ASESORIA_REPOSITORY');
