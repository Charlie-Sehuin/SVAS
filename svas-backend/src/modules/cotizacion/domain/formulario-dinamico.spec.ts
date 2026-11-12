import { unirCampos, type CampoAseguradora } from './formulario-dinamico';

const c = (
  aseguradora: string,
  nombre: string,
  extra: Partial<CampoAseguradora> = {},
): CampoAseguradora => ({
  aseguradora,
  nombre,
  tipo: 'LISTA',
  obligatorio: true,
  origenValores: 'CATALOGO',
  valores: [],
  ...extra,
});

describe('unirCampos (RN-17)', () => {
  const formulario = unirCampos([
    c('Rímac', 'marca'),
    c('Pacífico', 'marca'),
    c('Pacífico', 'ubigeo'),
    c('La Positiva', 'tipo'),
    c('Rímac', 'placa', {
      tipo: 'TEXTO',
      obligatorio: false,
      origenValores: 'ESTATICO',
    }),
    c('Qualitas', 'clase', {
      obligatorio: false,
      origenValores: 'ESTATICO',
      valores: ['SUV', 'Automóvil'],
    }),
    c('La Positiva', 'clase', {
      obligatorio: true,
      origenValores: 'ESTATICO',
      valores: ['Camioneta', 'SUV'],
    }),
  ]);

  it('un campo por nombre, en el orden del formulario y sin "tipo"', () => {
    expect(formulario.map((f) => f.nombre)).toEqual([
      'marca',
      'ubigeo',
      'clase',
      'placa',
    ]);
  });

  it('suma aseguradoras y valores; obligatorio si alguna lo exige', () => {
    const clase = formulario.find((f) => f.nombre === 'clase')!;
    expect(clase.obligatorio).toBe(true);
    expect(clase.valoresPermitidos).toEqual(['Automóvil', 'Camioneta', 'SUV']);
    expect(clase.aseguradoras).toEqual(['La Positiva', 'Qualitas']);
    expect(formulario.find((f) => f.nombre === 'ubigeo')!.aseguradoras).toEqual(
      ['Pacífico'],
    );
  });
});
