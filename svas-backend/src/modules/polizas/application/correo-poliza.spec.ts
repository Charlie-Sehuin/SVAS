import type { DatosPolizaPdf } from '../domain/poliza';
import { armarCorreoPoliza, esCorreoDeDemostracion } from './correo-poliza';

const datos = (cambios: Partial<DatosPolizaPdf> = {}) =>
  ({
    polizaId: 'p1',
    numeroPoliza: 'LPV-2026-4750FA93',
    titular: {
      nombres: 'maria',
      apellidos: 'paredes',
      numeroDocumento: '65203478',
    },
    vehiculo: { marca: 'Audi', modelo: 'Q3', anio: 2016, placa: 'KJL-412' },
    contenidoPlan: { aseguradora: 'La Positiva', plan: 'Full' },
    ...cambios,
  }) as unknown as DatosPolizaPdf;

describe('armarCorreoPoliza', () => {
  it('saluda con el nombre con mayúscula inicial y dice qué póliza, qué auto y con qué aseguradora', () => {
    const c = armarCorreoPoliza(datos());
    expect(c.asunto).toBe('Tu póliza LPV-2026-4750FA93 de La Positiva');
    expect(c.texto).toContain('Hola, Maria:');
    expect(c.texto).toContain('LPV-2026-4750FA93');
    expect(c.texto).toContain('La Positiva, plan Full');
    expect(c.texto).toContain('Audi Q3 2016');
  });

  it('lleva la leyenda de demostración (RNF-20) en el texto y en el HTML', () => {
    const c = armarCorreoPoliza(datos());
    expect(c.texto).toContain('Documento de demostración sin validez legal');
    expect(c.html).toContain('Documento de demostración sin validez legal');
  });

  it('sin nombre, saluda sin nombre', () => {
    const c = armarCorreoPoliza(
      datos({ titular: { nombres: '', apellidos: '', numeroDocumento: null } }),
    );
    expect(c.texto.startsWith('Hola: ')).toBe(true);
  });

  it('escapa el HTML de lo que escribió la persona', () => {
    const c = armarCorreoPoliza(
      datos({
        titular: {
          nombres: '<script>alert(1)</script>',
          apellidos: 'x',
          numeroDocumento: null,
        },
      }),
    );
    expect(c.html).not.toContain('<script>');
    expect(c.html).toContain('&lt;script&gt;');
  });
});

describe('esCorreoDeDemostracion', () => {
  it('reconoce el dominio de los datos de demostración, sin importar mayúsculas ni espacios', () => {
    expect(esCorreoDeDemostracion('cliente1@demo.svas.pe')).toBe(true);
    expect(esCorreoDeDemostracion('  Cliente2@DEMO.SVAS.PE ')).toBe(true);
  });
  it('no confunde correos reales', () => {
    expect(esCorreoDeDemostracion('ana@gmail.com')).toBe(false);
    expect(esCorreoDeDemostracion('ana@demo.svas.pe.otro.com')).toBe(false);
  });
});
