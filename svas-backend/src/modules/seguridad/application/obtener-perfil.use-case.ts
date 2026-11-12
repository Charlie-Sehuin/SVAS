import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Usuario } from '../domain/usuario';
import {
  USUARIO_REPOSITORY,
  type UsuarioRepository,
} from '../domain/usuario.repository.port';

@Injectable()
export class ObtenerPerfilUseCase {
  constructor(
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: UsuarioRepository,
  ) {}

  async ejecutar(usuarioId: string): Promise<Usuario> {
    const usuario = await this.usuarios.buscarPorId(usuarioId);
    // RolesGuard ya exigió que exista y esté activo; esto cubre una carrera.
    if (!usuario) throw new NotFoundException('No encontramos tu perfil');
    return usuario;
  }
}
