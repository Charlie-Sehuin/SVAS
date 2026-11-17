import { Inject, Injectable } from '@nestjs/common';
import {
  CONTACTO_CLIENTE_REPOSITORY,
  type ContactoCliente,
  type ContactoClienteRepository,
} from '../domain/contacto-cliente.repository.port';

/**
 * Datos de contacto del propio cliente, para no volver a pedírselos al cotizar
 * con la sesión iniciada. Una cuenta sin ficha (asesor, admin, cliente nuevo)
 * devuelve null.
 */
@Injectable()
export class ObtenerContactoUseCase {
  constructor(
    @Inject(CONTACTO_CLIENTE_REPOSITORY)
    private readonly contactos: ContactoClienteRepository,
  ) {}

  ejecutar(
    accessToken: string,
    usuarioId: string,
  ): Promise<ContactoCliente | null> {
    return this.contactos.deUsuario(accessToken, usuarioId);
  }
}
