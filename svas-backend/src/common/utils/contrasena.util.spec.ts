import {
  generarContrasenaLegible,
  PALABRAS_CONTRASENA,
} from './contrasena.util';

describe('contrasena.util', () => {
  it('la lista no repite palabras y todas son simples (sin tildes, ñ ni espacios)', () => {
    const unicas = new Set(PALABRAS_CONTRASENA);
    expect(unicas.size).toBe(PALABRAS_CONTRASENA.length);
    // La entropía declarada (≈ 38 bits) supone al menos 250 palabras distintas.
    expect(PALABRAS_CONTRASENA.length).toBeGreaterThanOrEqual(250);
    for (const p of PALABRAS_CONTRASENA) expect(p).toMatch(/^[a-z]{3,9}$/);
  });

  it('arma cuatro palabras en mayúscula inicial y un número de dos cifras', () => {
    for (let i = 0; i < 200; i++) {
      const c = generarContrasenaLegible();
      expect(c).toMatch(/^([A-Z][a-z]+-){4}[1-9][0-9]$/);
      const palabras = c.split('-').slice(0, 4);
      for (const p of palabras) {
        expect(PALABRAS_CONTRASENA).toContain(p.toLowerCase());
      }
    }
  });

  it('cumple el mínimo de 8 caracteres de Supabase y no se repite entre llamadas', () => {
    const muestras = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const c = generarContrasenaLegible();
      expect(c.length).toBeGreaterThanOrEqual(8);
      muestras.add(c);
    }
    // 500 frases de ~38 bits: una colisión sería evidencia de un generador roto.
    expect(muestras.size).toBe(500);
  });

  it('usa todo el rango de la lista (no se queda en las primeras palabras)', () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      for (const p of generarContrasenaLegible().split('-').slice(0, 4)) {
        vistas.add(p.toLowerCase());
      }
    }
    expect(vistas.size).toBeGreaterThan(PALABRAS_CONTRASENA.length * 0.9);
  });
});
