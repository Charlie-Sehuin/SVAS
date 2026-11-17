/**
 * Ejecuta `intento` y, si falla por algo pasajero (según `reintentar`), lo vuelve a ejecutar hasta `veces` veces más.
 * Gemini falla de forma intermitente (saturación, respuesta cortada); casi siempre el segundo intento responde.
 */
export async function conReintento<T>(
  intento: () => Promise<T>,
  reintentar: (error: unknown) => boolean,
  veces = 1,
): Promise<T> {
  let restantes = veces;
  for (;;) {
    try {
      return await intento();
    } catch (error) {
      if (restantes <= 0 || !reintentar(error)) throw error;
      restantes -= 1;
    }
  }
}
