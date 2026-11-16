import type { CanalContacto } from '../../../shared/types/enums';

/** Datos de contacto de la ficha `cliente` de una cuenta (nombres, apellidos, celular, correo, canal). */
export interface ContactoCliente {
  nombres: string;
  apellidos: string;
  telefono: string;
  email: string | null;
  canal: CanalContacto;
}

/** Lectura de la ficha del propio cliente, como ese usuario (RLS). */
export interface ContactoClienteRepository {
  deUsuario(
    accessToken: string,
    usuarioId: string,
  ): Promise<ContactoCliente | null>;
}

export const CONTACTO_CLIENTE_REPOSITORY = Symbol(
  'CONTACTO_CLIENTE_REPOSITORY',
);
