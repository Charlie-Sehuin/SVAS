import { randomInt } from 'node:crypto';

/**
 * Palabras comunes en español, sin tildes ni ñ, de 3 a 8 letras y fáciles de dictar.
 * Todas distintas (lo comprueba contrasena.util.spec.ts): de eso depende la entropía que se declara abajo.
 */
export const PALABRAS_CONTRASENA = [
  'abeja', 'aceite', 'agua', 'aguila', 'aire', 'alamo', 'alba', 'alma', 'amigo', 'ancla',
  'anillo', 'arbol', 'arena', 'arroz', 'aroma', 'avena', 'azucar', 'ave', 'aldea', 'almeja',
  'bahia', 'balsa', 'banco', 'barco', 'barro', 'bruma', 'brisa', 'bosque', 'bota', 'brasa',
  'burbuja', 'buho', 'bolsa', 'bufanda', 'bandera', 'botella', 'baul', 'bambu', 'bronce', 'bola',
  'cabra', 'cacao', 'cafe', 'caja', 'calle', 'camino', 'campo', 'canal', 'canto', 'capa',
  'carta', 'casa', 'cielo', 'cerro', 'cobre', 'coco', 'collar', 'color', 'copa', 'coral',
  'cometa', 'corona', 'cuarzo', 'cubo', 'dado', 'danza', 'delta', 'diente', 'dulce', 'duna',
  'domo', 'eco', 'escala', 'escudo', 'estrella', 'espejo', 'estufa', 'espiga', 'faro', 'fiesta',
  'flor', 'fuego', 'fruta', 'fuente', 'farol', 'fresa', 'foca', 'fogata', 'gallo', 'gato',
  'globo', 'goma', 'gorro', 'grano', 'grillo', 'guante', 'guitarra', 'gema', 'hamaca', 'harina',
  'hielo', 'hoja', 'hongo', 'huella', 'hormiga', 'huerto', 'hierro', 'higo', 'isla', 'iman',
  'iris', 'jardin', 'jarra', 'jaula', 'jengibre', 'joya', 'jugo', 'jirafa', 'kiwi', 'lago',
  'lampara', 'lana', 'lapiz', 'lazo', 'leche', 'lente', 'leon', 'libro', 'limon', 'llave',
  'lluvia', 'lobo', 'luna', 'luz', 'lirio', 'loro', 'madera', 'mango', 'mapa', 'mar',
  'marfil', 'mesa', 'miel', 'moneda', 'monte', 'mora', 'muelle', 'mundo', 'mural', 'musgo',
  'manzana', 'manta', 'maceta', 'martillo', 'nube', 'nieve', 'nido', 'nogal', 'norte', 'nuez',
  'naranja', 'nave', 'oasis', 'ola', 'olivo', 'onda', 'oro', 'oso', 'ostra', 'orquidea',
  'palma', 'pan', 'papel', 'pato', 'pera', 'perla', 'piedra', 'pino', 'pluma', 'plata',
  'playa', 'poema', 'pozo', 'prado', 'puente', 'puerta', 'panal', 'paloma', 'pastel', 'pelota',
  'pizarra', 'queso', 'quinoa', 'rama', 'raiz', 'rayo', 'red', 'reloj', 'rio', 'roble',
  'roca', 'rosa', 'rueda', 'ruta', 'radio', 'remo', 'risa', 'sal', 'sello', 'selva',
  'silla', 'sol', 'sombra', 'sopa', 'suelo', 'sauce', 'seda', 'semilla', 'taza', 'techo',
  'tigre', 'tinta', 'tierra', 'torre', 'tren', 'trigo', 'trueno', 'tulipan', 'tambor', 'teclado',
  'tomate', 'uva', 'valle', 'vapor', 'vela', 'velero', 'verde', 'viento', 'vid', 'viola',
  'volcan', 'vaso', 'vino', 'yate', 'yema', 'zafiro', 'zorro', 'zapato', 'zanahoria', 'zumo',
] as const;

const PALABRAS_POR_CONTRASENA = 4;

/**
 * Contraseña temporal fácil de leer, dictar y recordar: cuatro palabras al azar y un número de dos cifras,
 * p. ej. `Luna-Roble-Mango-Faro-47`.
 *
 * Seguridad: usa `crypto.randomInt` (sin sesgo). Con la lista de arriba son unos 38 bits de entropía,
 * menos que una cadena aleatoria de 16 caracteres. Es aceptable porque la contraseña es **temporal**, se muestra
 * una sola vez, Supabase limita los intentos y la persona debe cambiarla al entrar (menú → Cambiar contraseña).
 * No debe usarse como contraseña definitiva de nadie.
 */
export function generarContrasenaLegible(): string {
  const palabras = Array.from({ length: PALABRAS_POR_CONTRASENA }, () => {
    const p = PALABRAS_CONTRASENA[randomInt(PALABRAS_CONTRASENA.length)]!;
    return p.charAt(0).toUpperCase() + p.slice(1);
  });
  return `${palabras.join('-')}-${randomInt(10, 100)}`;
}
