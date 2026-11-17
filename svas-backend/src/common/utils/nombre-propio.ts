/**
 * "maria paredes" o "MARIA PAREDES" → "Maria Paredes". Si ya mezcla mayúsculas
 * y minúsculas se respeta como lo escribió la persona.
 */
export function nombrePropio(texto: string): string {
  const t = texto.trim().replace(/\s+/g, ' ');
  if (t !== t.toLowerCase() && t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .replace(
      /(^|[\s'-])(\p{L})/gu,
      (_, sep: string, letra: string) => sep + letra.toUpperCase(),
    );
}
