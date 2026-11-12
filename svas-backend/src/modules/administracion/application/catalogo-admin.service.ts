import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ErrorCampo } from '../../../common/types/usuario-autenticado';
import {
  normalizarValores,
  validarCampo,
  validarDescuentos,
  type Campo,
  type ParametrosComerciales,
  type Plan,
  type ReglaInspeccion,
} from '../domain/catalogo';
import {
  CATALOGO_ADMIN_REPOSITORY,
  type CambiosParametros,
  type CatalogoAdminRepository,
  type FiltrosBitacora,
  type GuardarCampo,
} from '../domain/catalogo-admin.repository.port';

function errorDeCampos(errors: ErrorCampo[]): BadRequestException {
  return new BadRequestException({ message: errors[0].mensaje, errors });
}

/**
 * Casos de uso del catálogo (RF-26 a RF-30). Valida las reglas que dan
 * mensajes por campo y delega el resto a los RPC (rol, bitácora, atomicidad).
 */
@Injectable()
export class CatalogoAdminService {
  constructor(
    @Inject(CATALOGO_ADMIN_REPOSITORY)
    private readonly repo: CatalogoAdminRepository,
  ) {}

  panel(token: string) {
    return this.repo.resumenPanel(token);
  }

  // ── Aseguradoras ──────────────────────────────────────────────────────────
  listarAseguradoras(token: string) {
    return this.repo.listarAseguradoras(token);
  }

  cambiarEstadoAseguradora(token: string, id: string, activa: boolean) {
    return this.repo.cambiarEstadoAseguradora(token, id, activa);
  }

  // ── Planes ────────────────────────────────────────────────────────────────
  listarPlanes(token: string, aseguradoraId?: string) {
    return this.repo.listarPlanes(token, aseguradoraId);
  }

  crearPlan(
    token: string,
    d: { aseguradoraId: string; nombre: string; descripcion?: string | null },
  ) {
    return this.repo.crearPlan(
      token,
      d.aseguradoraId,
      d.nombre,
      d.descripcion ?? null,
    );
  }

  /** PATCH parcial: nombre/descripción por un RPC y el estado por otro. */
  async editarPlan(
    token: string,
    id: string,
    d: { nombre?: string; descripcion?: string | null; activo?: boolean },
  ): Promise<Plan> {
    const actual = await this.repo.buscarPlan(token, id);
    if (!actual) throw new NotFoundException('El plan no existe');

    let plan = actual;
    if (d.nombre !== undefined || d.descripcion !== undefined) {
      plan = await this.repo.editarPlan(
        token,
        id,
        d.nombre ?? actual.nombre,
        d.descripcion !== undefined ? d.descripcion : actual.descripcion,
      );
    }
    if (d.activo !== undefined && d.activo !== plan.activo) {
      plan = await this.repo.cambiarEstadoPlan(token, id, d.activo);
    }
    return plan;
  }

  // ── Campos ────────────────────────────────────────────────────────────────
  listarCampos(token: string, aseguradoraId?: string) {
    return this.repo.listarCampos(token, aseguradoraId);
  }

  async crearCampo(
    token: string,
    aseguradoraId: string,
    c: GuardarCampo,
  ): Promise<Campo> {
    return this.repo.crearCampo(token, aseguradoraId, this.prepararCampo(c));
  }

  async editarCampo(
    token: string,
    id: string,
    c: GuardarCampo,
  ): Promise<Campo> {
    return this.repo.editarCampo(token, id, this.prepararCampo(c));
  }

  /** DELETE /admin/campos/:id desactiva, no borra (RN-16). */
  desactivarCampo(token: string, id: string): Promise<Campo> {
    return this.repo.cambiarEstadoCampo(token, id, false);
  }

  private prepararCampo(c: GuardarCampo): GuardarCampo {
    const listo = { ...c, valores: normalizarValores(c.valores) };
    const errores = validarCampo(listo);
    if (errores.length) {
      throw errorDeCampos(
        errores.map((mensaje) => ({ campo: 'valores', mensaje })),
      );
    }
    return listo;
  }

  // ── Reglas de inspección ──────────────────────────────────────────────────
  listarReglas(token: string) {
    return this.repo.listarReglas(token);
  }

  async guardarReglas(token: string, reglas: ReglaInspeccion[]) {
    const vistas = new Set<string>();
    for (const r of reglas) {
      const clave = `${r.aseguradoraId}|${r.uso}`;
      if (vistas.has(clave)) {
        throw errorDeCampos([
          {
            campo: 'reglas',
            mensaje: 'Hay reglas repetidas para la misma aseguradora y uso',
          },
        ]);
      }
      vistas.add(clave);
    }
    return this.repo.guardarReglas(token, reglas);
  }

  // ── Parámetros ────────────────────────────────────────────────────────────
  obtenerParametros(token: string) {
    return this.repo.obtenerParametros(token);
  }

  async actualizarParametros(
    token: string,
    cambios: CambiosParametros,
  ): Promise<ParametrosComerciales> {
    if (Object.values(cambios).every((v) => v === undefined)) {
      throw errorDeCampos([
        {
          campo: 'parametros',
          mensaje: 'Indica al menos un parámetro a cambiar',
        },
      ]);
    }
    if (
      cambios.descuentoPrimeraCompra !== undefined ||
      cambios.descuentoMaximo !== undefined
    ) {
      const vigentes = await this.repo.obtenerParametros(token);
      const errores = validarDescuentos({
        descuentoPrimeraCompra:
          cambios.descuentoPrimeraCompra ?? vigentes.descuentoPrimeraCompra,
        descuentoMaximo: cambios.descuentoMaximo ?? vigentes.descuentoMaximo,
      });
      if (errores.length) {
        throw errorDeCampos(
          errores.map((mensaje) => ({ campo: 'descuentos', mensaje })),
        );
      }
    }
    return this.repo.actualizarParametros(token, cambios);
  }

  // ── Bitácora ──────────────────────────────────────────────────────────────
  listarBitacora(token: string, filtros: FiltrosBitacora) {
    return this.repo.listarBitacora(token, filtros);
  }
}
