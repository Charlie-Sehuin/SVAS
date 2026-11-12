import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../../common/types/usuario-autenticado';
import type {
  CanalContacto,
  EstadoSolicitud,
  MotivoAsesoria,
  OrigenCaso,
} from '../../../shared/types/enums';
import {
  ASESORIA_REPOSITORY,
  type AsesoriaRepository,
} from '../domain/asesoria.repository.port';
import { contactoEnDetalle, contactoEnLista } from './vistas';

/** CU-03 Asesoría / descuento (contexto §8.4): RPC 6.5 a 6.7. */
@Injectable()
export class AsesoriasService {
  constructor(
    @Inject(ASESORIA_REPOSITORY) private readonly repo: AsesoriaRepository,
  ) {}

  /** POST /asesorias (CLIENTE dueño). */
  solicitar(
    accessToken: string,
    d: { cotizacionId: string; motivo: MotivoAsesoria; canal: CanalContacto },
  ) {
    return this.repo.solicitar(accessToken, d);
  }

  /** GET /asesorias/cola: datos personales enmascarados. */
  async cola(
    accessToken: string,
    usuarioId: string,
    filtros: { estado?: EstadoSolicitud; origen?: OrigenCaso },
  ) {
    const items = await this.repo.listarCola(accessToken, filtros);
    return items.map((s) => ({
      id: s.id,
      motivo: s.motivo,
      estado: s.estado,
      canal: s.canal,
      origen: s.origen,
      fechaCreacion: s.fechaCreacion,
      asignadoAMi: s.asesorId === usuarioId,
      cotizacion: s.cotizacion,
      cliente: contactoEnLista(s.cliente),
    }));
  }

  /** GET /asesorias/:id */
  async detalle(accessToken: string, usuario: UsuarioAutenticado, id: string) {
    const [s, parametros] = await Promise.all([
      this.repo.obtenerSolicitud(accessToken, id),
      this.repo.parametros(accessToken),
    ]);
    if (!s) throw new NotFoundException('La solicitud no existe');
    const asignadoAMi = s.asesorId === usuario.id;
    return {
      id: s.id,
      motivo: s.motivo,
      estado: s.estado,
      canal: s.canal,
      origen: s.origen,
      fechaCreacion: s.fechaCreacion,
      resultado: s.resultado,
      asignadoAMi,
      cotizacion: s.cotizacion,
      cliente: contactoEnDetalle(
        s.cliente,
        asignadoAMi || usuario.roles.includes('ADMINISTRADOR'),
      ),
      primas: s.primas,
      descuentos: s.descuentos,
      descuentoMaximo: parametros.descuentoMaximo,
    };
  }

  /** POST /asesorias/:id/tomar → 409 si otro asesor la tomó (RPC 6.5). */
  tomar(accessToken: string, id: string) {
    return this.repo.tomar(accessToken, id);
  }

  /** POST /asesorias/:id/descuentos (RPC 6.6; el tope lo valida T2). */
  aplicarDescuento(
    accessToken: string,
    id: string,
    planId: string,
    porcentaje: string,
  ) {
    return this.repo.aplicarDescuento(accessToken, id, planId, porcentaje);
  }

  /** POST /asesorias/:id/resultado (RPC 6.7). */
  cerrar(accessToken: string, id: string, resultado: string, acepta: boolean) {
    return this.repo.cerrarSolicitud(accessToken, id, resultado, acepta);
  }
}
