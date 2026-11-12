/**
 * Enmascarado de datos personales (doc contexto §7, campos sensibles).
 * Ej.: documento '12345678' → '****5678'; teléfono '987654321' → '****4321'.
 */
export function enmascarar(
  valor: string | null | undefined,
  visibles = 4,
): string | null {
  if (!valor) return null;
  const limpio = valor.trim();
  if (limpio.length <= visibles) return '****';
  return `****${limpio.slice(-visibles)}`;
}

export const enmascararDocumento = (doc: string | null | undefined) =>
  enmascarar(doc);
export const enmascararTelefono = (tel: string | null | undefined) =>
  enmascarar(tel);

/** 'cliente@example.com' → 'c*****e@example.com' */
export function enmascararEmail(
  email: string | null | undefined,
): string | null {
  if (!email) return null;
  const [usuario, dominio] = email.split('@');
  if (!usuario || !dominio) return '****';
  if (usuario.length <= 2) return `${usuario[0]}*@${dominio}`;
  return `${usuario[0]}${'*'.repeat(usuario.length - 2)}${usuario.at(-1)}@${dominio}`;
}
