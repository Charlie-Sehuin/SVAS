import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CONTACTO_CLIENTE_REPOSITORY,
  type CambiosContacto,
  type ContactoCliente,
  type ContactoClienteRepository,
} from '../domain/contacto-cliente.repository.port';

/**
 * Edita el celular y el canal preferido de la ficha del propio cliente. No crea la ficha: quien aún no cotizó
 * no tiene una y debe empezar por cotizar. Devuelve la ficha ya actualizada.
 */
@Injectable()
export class ActualizarContactoUseCase {
  constructor(
    @Inject(CONTACTO_CLIENTE_REPOSITORY)
    private readonly contactos: ContactoClienteRepository,
  ) {}

  async ejecutar(
    accessToken: string,
    usuarioId: string,
    cambios: CambiosContacto,
  ): Promise<ContactoCliente> {
    if (cambios.telefono === undefined && cambios.canal === undefined) {
      throw new BadRequestException(
        'Indica el celular o el canal de contacto que quieres cambiar',
      );
    }
    const actual = await this.contactos.deUsuario(accessToken, usuarioId);
    if (!actual) {
      throw new NotFoundException(
        'Aún no tienes datos de contacto. Se crean cuando cotizas tu primer seguro',
      );
    }
    await this.contactos.actualizar(usuarioId, cambios);
    const nuevo = await this.contactos.deUsuario(accessToken, usuarioId);
    // La ficha acaba de existir: si no se puede releer, algo falló y no se inventa una respuesta.
    if (!nuevo)
      throw new NotFoundException('No pudimos leer tus datos de contacto');
    return nuevo;
  }
}
