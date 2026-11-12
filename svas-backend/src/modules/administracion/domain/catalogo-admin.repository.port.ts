import type { TipoCampo } from '../../../shared/types/enums';
import type {
  Aseguradora,
  Campo,
  EntradaBitacora,
  OrigenValores,
  ParametrosComerciales,
  Plan,
  ReglaInspeccion,
} from './catalogo';

export interface GuardarCampo {
  nombre: string;
  tipo: TipoCampo;
  obligatorio: boolean;
  origenValores: OrigenValores;
  valores: string[];
  activo?: boolean;
}

export type CambiosParametros = Partial<{
  descuentoPrimeraCompra: number;
  descuentoMaximo: number;
  maxIntentos: number;
  diasSeguimiento: number;
  maxCuotas: number;
  vigenciaEnlaceDias: number;
  horasAbandono: number;
  moneda: string;
  tipoCambioReferencial: number;
}>;

export interface FiltrosBitacora {
  entidad?: string;
  desde?: Date;
  hasta?: Date;
  pagina: number;
  tamano: number;
}

export interface PaginaBitacora {
  items: EntradaBitacora[];
  total: number;
  pagina: number;
  tamano: number;
}

export interface ResumenPanel {
  aseguradoras: { total: number; activas: number };
  planes: { total: number; activos: number };
  campos: { total: number; activos: number };
  ultimosCambios: EntradaBitacora[];
}

/**
 * Catálogo del administrador. Todo con el JWT del administrador: las lecturas
 * pasan por RLS (el ADMINISTRADOR ve también lo inactivo) y las escrituras por
 * los RPC de 0015, que validan el rol y dejan la bitácora.
 */
export interface CatalogoAdminRepository {
  listarAseguradoras(token: string): Promise<Aseguradora[]>;
  cambiarEstadoAseguradora(
    token: string,
    id: string,
    activa: boolean,
  ): Promise<Aseguradora>;

  listarPlanes(token: string, aseguradoraId?: string): Promise<Plan[]>;
  crearPlan(
    token: string,
    aseguradoraId: string,
    nombre: string,
    descripcion: string | null,
  ): Promise<Plan>;
  editarPlan(
    token: string,
    id: string,
    nombre: string,
    descripcion: string | null,
  ): Promise<Plan>;
  buscarPlan(token: string, id: string): Promise<Plan | null>;
  cambiarEstadoPlan(token: string, id: string, activo: boolean): Promise<Plan>;

  listarCampos(token: string, aseguradoraId?: string): Promise<Campo[]>;
  crearCampo(
    token: string,
    aseguradoraId: string,
    campo: GuardarCampo,
  ): Promise<Campo>;
  editarCampo(token: string, id: string, campo: GuardarCampo): Promise<Campo>;
  cambiarEstadoCampo(
    token: string,
    id: string,
    activo: boolean,
  ): Promise<Campo>;

  listarReglas(token: string): Promise<ReglaInspeccion[]>;
  guardarReglas(
    token: string,
    reglas: ReglaInspeccion[],
  ): Promise<ReglaInspeccion[]>;

  obtenerParametros(token: string): Promise<ParametrosComerciales>;
  actualizarParametros(
    token: string,
    cambios: CambiosParametros,
  ): Promise<ParametrosComerciales>;

  listarBitacora(
    token: string,
    filtros: FiltrosBitacora,
  ): Promise<PaginaBitacora>;
  resumenPanel(token: string): Promise<ResumenPanel>;
}

export const CATALOGO_ADMIN_REPOSITORY = Symbol('CATALOGO_ADMIN_REPOSITORY');
