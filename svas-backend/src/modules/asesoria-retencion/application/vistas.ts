import {
  enmascararDocumento,
  enmascararEmail,
  enmascararTelefono,
} from '../../../common/utils/mask.util';
import type { ContactoDelCaso } from '../domain/asesoria.repository.port';

/**
 * Datos del cliente según el contexto (doc conexión §5):
 *  - lista: teléfono, email y documento enmascarados;
 *  - detalle: teléfono y email completos (el asesor debe contactarlo);
 *    documento completo solo en el caso asignado o para el ADMINISTRADOR.
 */
export function contactoEnLista(c: ContactoDelCaso) {
  return {
    nombre: `${c.nombres} ${c.apellidos}`,
    telefono: enmascararTelefono(c.telefono),
    email: enmascararEmail(c.email),
    canalPreferido: c.canalPreferido,
    numeroDocumento: enmascararDocumento(c.numeroDocumento),
  };
}

export function contactoEnDetalle(
  c: ContactoDelCaso,
  documentoCompleto: boolean,
) {
  return {
    nombres: c.nombres,
    apellidos: c.apellidos,
    telefono: c.telefono,
    email: c.email,
    canalPreferido: c.canalPreferido,
    numeroDocumento: documentoCompleto
      ? c.numeroDocumento
      : enmascararDocumento(c.numeroDocumento),
  };
}
