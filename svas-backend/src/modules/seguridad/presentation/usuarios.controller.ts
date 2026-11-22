import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AccessToken } from '../../../common/decorators/access-token.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../../../common/types/usuario-autenticado';
import {
  CambiarEstadoUsuarioUseCase,
  CambiarRolUsuarioUseCase,
  CrearUsuarioInternoUseCase,
  ListarUsuariosUseCase,
} from '../application/administrar-usuarios.use-cases';
import { ActualizarContactoUseCase } from '../application/actualizar-contacto.use-case';
import { ObtenerContactoUseCase } from '../application/obtener-contacto.use-case';
import { ActualizarContactoDto } from './dto/actualizar-contacto.dto';
import { ObtenerPerfilUseCase } from '../application/obtener-perfil.use-case';
import {
  aUsuarioResponse,
  CambiarEstadoDto,
  CambiarRolDto,
  CrearUsuarioDto,
  ListarUsuariosQuery,
  type UsuarioResponseDto,
} from './dto/usuarios.dto';

const idValido = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException('El id de usuario no es válido'),
});

/** GET /usuarios/me: cualquier usuario autenticado y activo. */
@Controller('usuarios')
export class UsuariosController {
  constructor(
    private readonly obtenerPerfil: ObtenerPerfilUseCase,
    private readonly obtenerContacto: ObtenerContactoUseCase,
    private readonly actualizarContacto: ActualizarContactoUseCase,
  ) {}

  @Get('me')
  async me(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<UsuarioResponseDto> {
    return aUsuarioResponse(await this.obtenerPerfil.ejecutar(usuario.id));
  }

  /** GET /usuarios/me/contacto: la ficha de contacto de mi cuenta, o `{ contacto: null }` si no tengo. */
  @Get('me/contacto')
  async miContacto(
    @AccessToken() token: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return { contacto: await this.obtenerContacto.ejecutar(token, usuario.id) };
  }

  /** PATCH /usuarios/me/contacto: cambia mi celular y/o mi canal preferido. Solo CLIENTE; responde la ficha ya actualizada. */
  @Roles('CLIENTE')
  @Patch('me/contacto')
  async actualizarMiContacto(
    @AccessToken() token: string,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: ActualizarContactoDto,
  ) {
    return {
      contacto: await this.actualizarContacto.ejecutar(token, usuario.id, {
        telefono: dto.telefono,
        canal: dto.canal,
      }),
    };
  }
}

/** Gestión de usuarios y roles (RF-31, RF-32). Solo ADMINISTRADOR. */
@Roles('ADMINISTRADOR')
@Controller('admin/usuarios')
export class AdminUsuariosController {
  constructor(
    private readonly listar: ListarUsuariosUseCase,
    private readonly crear: CrearUsuarioInternoUseCase,
    private readonly cambiarRol: CambiarRolUsuarioUseCase,
    private readonly cambiarEstado: CambiarEstadoUsuarioUseCase,
  ) {}

  @Get()
  async listarUsuarios(
    @AccessToken() token: string,
    @Query() q: ListarUsuariosQuery,
  ) {
    const pagina = await this.listar.ejecutar(token, q);
    return { ...pagina, items: pagina.items.map(aUsuarioResponse) };
  }

  @Post()
  async crearUsuario(
    @AccessToken() token: string,
    @Body() dto: CrearUsuarioDto,
  ) {
    const { usuario, contrasenaTemporal } = await this.crear.ejecutar(
      token,
      dto,
    );
    return { usuario: aUsuarioResponse(usuario), contrasenaTemporal };
  }

  @Patch(':id/rol')
  async rol(
    @AccessToken() token: string,
    @Param('id', idValido) id: string,
    @Body() dto: CambiarRolDto,
  ): Promise<UsuarioResponseDto> {
    return aUsuarioResponse(await this.cambiarRol.ejecutar(token, id, dto.rol));
  }

  @Patch(':id/estado')
  async estado(
    @AccessToken() token: string,
    @Param('id', idValido) id: string,
    @Body() dto: CambiarEstadoDto,
  ): Promise<UsuarioResponseDto> {
    return aUsuarioResponse(
      await this.cambiarEstado.ejecutar(token, id, dto.activo),
    );
  }
}
