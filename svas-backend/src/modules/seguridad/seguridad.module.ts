import { Module } from '@nestjs/common';
import {
  CambiarEstadoUsuarioUseCase,
  CambiarRolUsuarioUseCase,
  CrearUsuarioInternoUseCase,
  ListarUsuariosUseCase,
} from './application/administrar-usuarios.use-cases';
import { ObtenerPerfilUseCase } from './application/obtener-perfil.use-case';
import { RegistrarClienteUseCase } from './application/registrar-cliente.use-case';
import { PROVEEDOR_IDENTIDAD } from './domain/proveedor-identidad.port';
import { USUARIO_REPOSITORY } from './domain/usuario.repository.port';
import { SupabaseProveedorIdentidad } from './infrastructure/supabase-proveedor-identidad';
import { UsuarioSupabaseRepository } from './infrastructure/usuario-supabase.repository';
import { AuthController } from './presentation/auth.controller';
import {
  AdminUsuariosController,
  UsuariosController,
} from './presentation/usuarios.controller';

@Module({
  controllers: [AuthController, UsuariosController, AdminUsuariosController],
  providers: [
    { provide: PROVEEDOR_IDENTIDAD, useClass: SupabaseProveedorIdentidad },
    { provide: USUARIO_REPOSITORY, useClass: UsuarioSupabaseRepository },
    RegistrarClienteUseCase,
    ObtenerPerfilUseCase,
    ListarUsuariosUseCase,
    CrearUsuarioInternoUseCase,
    CambiarRolUsuarioUseCase,
    CambiarEstadoUsuarioUseCase,
  ],
})
export class SeguridadModule {}
