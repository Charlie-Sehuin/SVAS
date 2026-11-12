import { Module } from '@nestjs/common';
import {
  CambiarEstadoUsuarioUseCase,
  CambiarRolUsuarioUseCase,
  CrearUsuarioInternoUseCase,
  ListarUsuariosUseCase,
} from './application/administrar-usuarios.use-cases';
import { IniciarSesionUseCase } from './application/iniciar-sesion.use-case';
import { ObtenerPerfilUseCase } from './application/obtener-perfil.use-case';
import { RefrescarSesionUseCase } from './application/refrescar-sesion.use-case';
import { RegistrarClienteUseCase } from './application/registrar-cliente.use-case';
import { SesionAutorizadaService } from './application/sesion-autorizada.service';
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
    SesionAutorizadaService,
    IniciarSesionUseCase,
    RefrescarSesionUseCase,
    RegistrarClienteUseCase,
    ObtenerPerfilUseCase,
    ListarUsuariosUseCase,
    CrearUsuarioInternoUseCase,
    CambiarRolUsuarioUseCase,
    CambiarEstadoUsuarioUseCase,
  ],
})
export class SeguridadModule {}
