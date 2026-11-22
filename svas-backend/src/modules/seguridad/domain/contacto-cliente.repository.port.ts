import type { CanalContacto } from '../../../shared/types/enums';

/** Datos de contacto de la ficha `cliente` de una cuenta (nombres, apellidos, celular, correo, canal). */
export interface ContactoCliente {
  nombres: string;
  apellidos: string;
  telefono: string;
  email: string | null;
  canal: CanalContacto;
}

/** Lo único que el cliente puede cambiar de su ficha desde "Mi cuenta". */
export interface CambiosContacto {
  telefono?: string;
  canal?: CanalContacto;
}

export interface ContactoClienteRepository {
  /** Lectura de la ficha del propio cliente, como ese usuario (RLS). */
  deUsuario(
    accessToken: string,
    usuarioId: string,
  ): Promise<ContactoCliente | null>;

  /**
   * Cambia el celular y/o el canal de la ficha de la cuenta, con el RPC `vincular_cliente` (que además deja el
   * registro en la bitácora). Solo actualiza: el caso de uso ya comprobó que la ficha existe.
   */
  actualizar(usuarioId: string, cambios: CambiosContacto): Promise<void>;
}

export const CONTACTO_CLIENTE_REPOSITORY = Symbol(
  'CONTACTO_CLIENTE_REPOSITORY',
);
