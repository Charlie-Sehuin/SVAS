import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../../common/types/usuario-autenticado';
import type {
  CanalContacto,
  EstadoSeguimiento,
  MotivoCierre,
  ResultadoIntento,
} from '../../../shared/types/enums';
import {
  ASESORIA_REPOSITORY,
  type AsesoriaRepository,
} from '../domain/asesoria.repository.port';
import { AvisoClienteService } from './aviso-cliente.service';
import { contactoEnDetalle, contactoEnLista } from './vistas';

/** CU-04 Seguimiento / telemarketing (contexto §8.5): RPC 6.8 y 6.9. */
@Injectable()
export class SeguimientosService {
  constructor(
    @Inject(ASESORIA_REPOSITORY) private readonly repo: AsesoriaRepository,
    private readonly aviso: AvisoClienteService,
  ) {}

  /** GET /seguimientos?estado= (por defecto los EN_SEGUIMIENTO). */
  async listar(accessToken: string, estado?: EstadoSeguimiento) {
    const items = await this.repo.listarSeguimientos(accessToken, estado);
    return items.map((s) => ({
      id: s.id,
      estado: s.estado,
      intentos: s.intentos,
      fechaApertura: s.fechaApertura,
      fechaCierre: s.fechaCierre,
      motivoCierre: s.motivoCierre,
      cotizacion: s.cotizacion,
      cliente: contactoEnLista(s.cliente),
    }));
  }

  /** GET /seguimientos/:id: con historial de intentos y los límites de RN-10. */
  async detalle(accessToken: string, usuario: UsuarioAutenticado, id: string) {
    const [s, parametros] = await Promise.all([
      this.repo.obtenerSeguimiento(accessToken, id),
      this.repo.parametros(accessToken),
    ]);
    if (!s) throw new NotFoundException('El seguimiento no existe');
    return {
      id: s.id,
      estado: s.estado,
      intentos: s.intentos,
      maxIntentos: parametros.maxIntentos,
      diasSeguimiento: parametros.diasSeguimiento,
      fechaApertura: s.fechaApertura,
      fechaCierre: s.fechaCierre,
      motivoCierre: s.motivoCierre,
      cotizacion: s.cotizacion,
      cliente: contactoEnDetalle(
        s.cliente,
        usuario.roles.includes('ADMINISTRADOR'),
      ),
      historial: s.historial,
      primas: s.primas,
      descuentos: s.descuentos,
    };
  }

  /**
   * POST /seguimientos/:id/intentos. Al llegar al máximo sin ACEPTA el RPC
   * cierra como DESCARTADO / NO_RESPONDE y se envía el mensaje final.
   */
  async registrarIntento(
    accessToken: string,
    id: string,
    canal: CanalContacto,
    resultado: ResultadoIntento,
  ) {
    const r = await this.repo.registrarIntento(
      accessToken,
      id,
      canal,
      resultado,
    );
    const warning = r.cierre
      ? await this.aviso.enviar(r.cierre, 'MENSAJE_FINAL')
      : undefined;
    return {
      intentos: r.intentos,
      maxIntentos: r.maxIntentos,
      estado: r.cierre?.estado ?? 'EN_SEGUIMIENTO',
      motivoCierre: r.cierre?.motivo ?? null,
      ...(warning && { warning }),
    };
  }

  /** POST /seguimientos/:id/aceptacion: reenvía el enlace de compra. */
  async aceptacion(accessToken: string, id: string) {
    const aviso = await this.repo.enviarEnlaceCompra(accessToken, id);
    const warning = await this.aviso.enviar(aviso, 'ENLACE_COMPRA');
    return { enlaceEnviado: !warning, ...(warning && { warning }) };
  }

  /** POST /seguimientos/:id/cierre: DESCARTADO envía el mensaje final (RN-12). */
  async cerrar(
    accessToken: string,
    id: string,
    estado: EstadoSeguimiento,
    motivo: MotivoCierre | null,
  ) {
    const cierre = await this.repo.cerrarSeguimiento(
      accessToken,
      id,
      estado,
      motivo,
    );
    const warning = await this.aviso.enviar(cierre, 'MENSAJE_FINAL');
    return {
      estado: cierre.estado,
      motivoCierre: cierre.motivo,
      ...(warning && { warning }),
    };
  }
}
