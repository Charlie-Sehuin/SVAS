import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ErrorCampo } from '../../../common/types/usuario-autenticado';
import {
  USO_VEHICULO,
  ZONA_RIESGO,
  type UsoVehiculo,
  type ZonaRiesgo,
} from '../../../shared/types/enums';
import {
  pendientesDeEscenario,
  type EscenarioParaGuardar,
  type FilaCobertura,
  type FilaFactor,
  type FilaFrecuencia,
  type FilaZona,
} from '../domain/prueba-choque-admin';
import {
  PRUEBA_CHOQUE_ADMIN_REPOSITORY,
  type PruebaChoqueAdminRepository,
} from '../domain/prueba-choque-admin.repository.port';

function errorDeCampos(errors: ErrorCampo[]): BadRequestException {
  return new BadRequestException({ message: errors[0].mensaje, errors });
}

/** Marca las filas cuya clave ya apareció antes en la misma carga. */
function repetidas<T>(
  filas: T[],
  clave: (f: T) => string,
  mensaje: string,
): ErrorCampo[] {
  const vistas = new Set<string>();
  const errores: ErrorCampo[] = [];
  filas.forEach((f, i) => {
    const k = clave(f);
    if (vistas.has(k)) errores.push({ campo: `filas.${i}`, mensaje });
    vistas.add(k);
  });
  return errores;
}

/**
 * Catálogo de la Prueba de Choque (contexto §16, RN-31): escenarios,
 * coberturas plan × escenario, frecuencias, zonas y factores de perfil. Los
 * RPC de 0029 vuelven a validar todo y dejan el antes/después en la bitácora.
 * El motor lee el catálogo en cada simulación (sin caché), así que un cambio
 * vale desde la siguiente; las simulaciones guardadas no cambian (RN-32).
 */
@Injectable()
export class PruebaChoqueAdminService {
  constructor(
    @Inject(PRUEBA_CHOQUE_ADMIN_REPOSITORY)
    private readonly repo: PruebaChoqueAdminRepository,
  ) {}

  // ── Escenarios ────────────────────────────────────────────────────────────
  /** Todos (también inactivos); los activos traen lo que les falta para simular bien. */
  async listarEscenarios(token: string) {
    const [escenarios, frecuencias, coberturas, planes] = await Promise.all([
      this.repo.listarEscenarios(token),
      this.repo.listarFrecuencias(token, {}),
      this.repo.listarCoberturas(token, {}),
      this.repo.planesActivos(token),
    ]);
    return escenarios.map((e) => ({
      ...e,
      pendientes: e.activo
        ? pendientesDeEscenario(
            e.codigo,
            frecuencias,
            coberturas,
            planes,
            USO_VEHICULO,
            ZONA_RIESGO,
          )
        : null,
    }));
  }

  guardarEscenario(token: string, codigo: string, e: EscenarioParaGuardar) {
    return this.repo.guardarEscenario(token, codigo, e);
  }

  // ── Coberturas ────────────────────────────────────────────────────────────
  listarCoberturas(token: string, f: { planId?: string; escenario?: string }) {
    return this.repo.listarCoberturas(token, f);
  }

  async guardarCoberturas(token: string, filas: FilaCobertura[]) {
    const errores: ErrorCampo[] = [];
    filas.forEach((c, i) => {
      if (
        !c.cubre &&
        (c.deduciblePct != null ||
          c.deducibleMinimo != null ||
          c.topeCobertura != null ||
          (c.diasAutoReemplazo ?? 0) !== 0)
      ) {
        errores.push({
          campo: `filas.${i}`,
          mensaje:
            'Si el plan no cubre el escenario, no lleva deducible, tope ni días de reemplazo',
        });
      }
    });
    errores.push(
      ...repetidas(
        filas,
        (c) => `${c.planId.toLowerCase()}|${c.escenario}`,
        'Hay coberturas repetidas para el mismo plan y escenario',
      ),
    );
    if (errores.length) throw errorDeCampos(errores);
    return this.repo.guardarCoberturas(token, filas);
  }

  // ── Frecuencias ───────────────────────────────────────────────────────────
  listarFrecuencias(
    token: string,
    f: { escenario?: string; uso?: UsoVehiculo },
  ) {
    return this.repo.listarFrecuencias(token, f);
  }

  async guardarFrecuencias(token: string, filas: FilaFrecuencia[]) {
    const errores = repetidas(
      filas,
      (f) => `${f.escenario}|${f.uso}|${f.zona}`,
      'Hay frecuencias repetidas para el mismo escenario, uso y zona',
    );
    if (errores.length) throw errorDeCampos(errores);
    return this.repo.guardarFrecuencias(token, filas);
  }

  // ── Zonas ─────────────────────────────────────────────────────────────────
  listarZonas(token: string, zona?: ZonaRiesgo) {
    return this.repo.listarZonas(token, zona);
  }

  async guardarZonas(token: string, filas: FilaZona[]) {
    const errores = repetidas(
      filas,
      (z) => z.ubigeo,
      'Hay distritos repetidos en la carga',
    );
    if (errores.length) throw errorDeCampos(errores);
    return this.repo.guardarZonas(token, filas);
  }

  // ── Factores ──────────────────────────────────────────────────────────────
  listarFactores(token: string, escenario?: string) {
    return this.repo.listarFactores(token, escenario);
  }

  async guardarFactores(token: string, filas: FilaFactor[]) {
    const errores = repetidas(
      filas,
      (f) => `${f.escenario}|${f.variable}`,
      'Hay factores repetidos para el mismo escenario y variable',
    );
    if (errores.length) throw errorDeCampos(errores);
    return this.repo.guardarFactores(token, filas);
  }
}
