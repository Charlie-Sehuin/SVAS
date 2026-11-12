import {
  enmascararDocumento,
  enmascararEmail,
  enmascararTelefono,
} from './mask.util';
import { aJson, redondear, sumar } from './money.util';
import { generarToken, sha256Hex, tokenCoincide } from './token.util';

describe('mask.util', () => {
  it('documento y teléfono muestran solo los últimos 4', () => {
    expect(enmascararDocumento('12345678')).toBe('****5678');
    expect(enmascararTelefono('987654321')).toBe('****4321');
    expect(enmascararDocumento('123')).toBe('****');
    expect(enmascararDocumento(null)).toBeNull();
  });

  it('email conserva primera y última letra del usuario', () => {
    expect(enmascararEmail('cliente@example.com')).toBe('c*****e@example.com');
    expect(enmascararEmail('ab@x.com')).toBe('a*@x.com');
  });
});

describe('token.util', () => {
  it('genera tokens distintos y url-safe', () => {
    const a = generarToken();
    expect(a).not.toBe(generarToken());
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('compara contra el hash guardado', () => {
    const token = generarToken();
    const hash = sha256Hex(token);
    expect(tokenCoincide(token, hash)).toBe(true);
    expect(tokenCoincide(generarToken(), hash)).toBe(false);
    expect(tokenCoincide(token, 'no-hex')).toBe(false);
  });
});

describe('money.util', () => {
  it('evita errores de float', () => {
    expect(aJson(sumar('0.1', '0.2'))).toBe('0.30');
  });

  it('redondea half-up a 2 decimales', () => {
    expect(redondear('2.345').toFixed(2)).toBe('2.35');
    expect(aJson('1234.5')).toBe('1234.50');
  });

  it('rechaza montos inválidos', () => {
    expect(() => aJson('abc')).toThrow();
    expect(() => aJson(Infinity)).toThrow(/inválido/);
  });
});
