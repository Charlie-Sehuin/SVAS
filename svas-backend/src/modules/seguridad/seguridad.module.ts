import { Module } from '@nestjs/common';
import {
  CambiarEstadoUsuarioUseCase,
  CambiarRolUsuarioUseCase,
  CrearUsuarioInternoUseCase,
  ListarUsuariosUseCase,
} from './application/administrar-usuarios.use-cases';
import { ActualizarContactoUseCase } from './application/actualizar-contacto.use-case';
import { ObtenerContactoUseCase } from './application/obtener-contacto.use-case';
import { ObtenerPerfilUseCase } from './application/obtener-perfil.use-case';
import { CONTACTO_CLIENTE_REPOSITORY } from './domain/contacto-cliente.repository.port';
import { ContactoClienteSupabaseRepository } from './infrastructure/contacto-cliente-supabase.repository';
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
    {
      provide: CONTACTO_CLIENTE_REPOSITORY,
      useClass: ContactoClienteSupabaseRepository,
    },
    RegistrarClienteUseCase,
    ObtenerPerfilUseCase,
    ObtenerContactoUseCase,
    ActualizarContactoUseCase,
    ListarUsuariosUseCase,
    CrearUsuarioInternoUseCase,
    CambiarRolUsuarioUseCase,
    CambiarEstadoUsuarioUseCase,
  ],
})
export class SeguridadModule {}
