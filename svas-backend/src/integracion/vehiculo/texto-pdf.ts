import { extractText, getDocumentProxy } from 'unpdf';

/** Con menos texto que esto, el PDF es un escaneo (una foto dentro del PDF): no hay nada que leer sin IA de visión. */
export const MIN_CARACTERES_PDF = 40;
/** Tope de lo que se manda al modelo: una tarjeta cabe de sobra. */
export const MAX_CARACTERES_PDF = 6_000;

/** Saca el texto de un PDF digital (sin IA). Un PDF escaneado o dañado da cadena vacía. */
export async function extraerTextoPdf(datos: Buffer): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(datos));
    const { text } = await extractText(pdf, { mergePages: true });
    return text.replace(/[ \t]+/g, ' ').trim().slice(0, MAX_CARACTERES_PDF);
  } catch {
    return '';
  }
}
