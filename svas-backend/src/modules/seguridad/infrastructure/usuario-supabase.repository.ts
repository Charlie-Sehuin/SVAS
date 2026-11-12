import { Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorBaseDatos } from '../../../common/filters/postgrest-error.filter';
import {
  SUPABASE_SERVICE_CLIENT,
  type SupabaseServiceClient,
} from '../../../infrastructure/database/supabase-service-client.provider';
import { SupabaseUserClientFactory } from '../../../infrastructure/database/supabase-user-client.factory';
import type { Rol } from '../../../shared/types/enums';
import type { RolInterno, Usuario } from '../domain/usuario';
import type {
  FiltrosUsuarios,
  PaginaUsuarios,
  UsuarioRepository,
} from '../domain/usuario.repository.port';

interface FilaUsuario {
  id: string;
  email: string;
  rol: Rol;
  nombre_completo: string;
  activo: boolean;
}

const COLUMNAS = 'id, email, rol, nombre_completo, activo';

@Injectable()
export class UsuarioSupabaseRepository implements UsuarioRepository {
  private readonly logger = new Logger(UsuarioSupabaseRepository.name);

  constructor(
    @Inject(SUPABASE_SERVICE_CLIENT)
    private readonly servicio: SupabaseServiceClient,
    private readonly clientes: SupabaseUserClientFactory,
  ) {}

  async buscarPorId(id: string): Promise<Usuario | null> {
    const { data, error } = await this.servicio
      .from('usuario')
      .select(COLUMNAS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new ErrorBaseDatos(error);
    return data ? aUsuario(data as FilaUsuario) : null;
  }

  async registrarCliente(u: {
    id: string;
    email: string;
    nombreCompleto: string;
  }): Promise<Usuario> {
    const { data, error } = await this.servicio
      .from('usuario')
      .insert({
        id: u.id,
        email: u.email,
        nombre_completo: u.nombreCompleto,
        rol: 'CLIENTE',
        activo: true,
      })
      .select(COLUMNAS)
      .single();
    if (error) throw new ErrorBaseDatos(error);

    const { error: errorBitacora } = await this.servicio
      .from('registro_actividad')
      .insert({
        usuario_id: u.id,
        accion: 'REGISTRO_CLIENTE',
        entidad: 'usuario',
        entidad_id: u.id,
      });
    if (errorBitacora) {
      this.logger.warn(
        `Cliente ${u.id} registrado sin bitácora: ${errorBitacora.message}`,
      );
    }
    return aUsuario(data as FilaUsuario);
  }

  async listar(
    accessToken: string,
    f: FiltrosUsuarios,
  ): Promise<PaginaUsuarios> {
    const desde = (f.pagina - 1) * f.tamano;
    let consulta = this.clientes
      .paraToken(accessToken)
      .from('usuario')
      .select(COLUMNAS, { count: 'exact' })
      .order('nombre_completo')
      .range(desde, desde + f.tamano - 1);

    if (f.rol) consulta = consulta.eq('rol', f.rol);
    if (f.activo !== undefined) consulta = consulta.eq('activo', f.activo);
    const termino = limpiarBusqueda(f.busqueda);
    if (termino) {
      consulta = consulta.or(
        `email.ilike.*${termino}*,nombre_completo.ilike.*${termino}*`,
      );
    }

    const { data, count, error } = await consulta;
    if (error) throw new ErrorBaseDatos(error);
    return {
      items: (data as FilaUsuario[]).map(aUsuario),
      total: count ?? 0,
      pagina: f.pagina,
      tamano: f.tamano,
    };
  }

  registrarInterno(
    accessToken: string,
    u: { id: string; email: string; nombreCompleto: string; rol: RolInterno },
  ): Promise<Usuario> {
    return this.rpc(accessToken, 'admin_registrar_usuario_interno', {
      p_usuario_id: u.id,
      p_email: u.email,
      p_nombre_completo: u.nombreCompleto,
      p_rol: u.rol,
    });
  }

  cambiarRol(
    accessToken: string,
    id: string,
    rol: RolInterno,
  ): Promise<Usuario> {
    return this.rpc(accessToken, 'admin_cambiar_rol_usuario', {
      p_usuario_id: id,
      p_rol: rol,
    });
  }

  cambiarEstado(
    accessToken: string,
    id: string,
    activo: boolean,
  ): Promise<Usuario> {
    return this.rpc(accessToken, 'admin_cambiar_estado_usuario', {
      p_usuario_id: id,
      p_activo: activo,
    });
  }

  private async rpc(
    accessToken: string,
    nombre: string,
    params: Record<string, unknown>,
  ): Promise<Usuario> {
    const { data, error } = await this.clientes
      .paraToken(accessToken)
      .rpc(nombre, params);
    if (error) throw new ErrorBaseDatos(error);
    return aUsuario(data as FilaUsuario);
  }
}

function aUsuario(f: FilaUsuario): Usuario {
  return {
    id: f.id,
    email: f.email,
    rol: f.rol,
    nombreCompleto: f.nombre_completo,
    activo: f.activo,
  };
}

/**
 * El término va dentro de un filtro `or=(...)` de PostgREST: se quitan los
 * caracteres con significado en esa sintaxis (coma, paréntesis, comodines,
 * comillas, barra) para que nadie pueda inyectar condiciones.
 */
export function limpiarBusqueda(termino: string | undefined): string {
  return (termino ?? '')
    .replace(/[^\p{L}\p{N}@._\- ]/gu, '')
    .trim()
    .slice(0, 100);
}
