import {
  decidirDerivacion,
  validarContraCatalogo,
  verificarNicho,
  type ReglaInspeccion,
} from './cotizacion';
import type { CampoFormulario } from './formulario-dinamico';

const regla = (
  uso: ReglaInspeccion['uso'],
  requiereInspeccion: boolean,
): ReglaInspeccion => ({ aseguradoraId: 'a1', uso, requiereInspeccion });

const REGLAS_SEED = [
  regla('PARTICULAR', false),
  regla('COMERCIAL_LIGERO', false),
  regla('TRANSPORTE_PASAJEROS', true),
];

describe('decidirDerivacion (RN-01..04)', () => {
  it('RN-01: particular estándar → ambas opciones', () => {
    expect(decidirDerivacion('PARTICULAR', true, REGLAS_SEED)).toEqual({
      opciones: ['COMPRA_INMEDIATA', 'ASESORIA'],
      motivo: null,
    });
  });

  it('RN-02: comercial sin inspección → ambas opciones', () => {
    expect(
      decidirDerivacion('COMERCIAL_LIGERO', true, REGLAS_SEED).motivo,
    ).toBeNull();
  });

  it('RN-03: uso con inspección → solo ASESORIA por INSPECCION', () => {
    expect(
      decidirDerivacion('TRANSPORTE_PASAJEROS', true, REGLAS_SEED),
    ).toEqual({
      opciones: ['ASESORIA'],
      motivo: 'INSPECCION',
    });
  });

  it('RN-03 manda sobre RN-04 (inspección aunque nadie cotice)', () => {
    expect(
      decidirDerivacion('TRANSPORTE_PASAJEROS', false, REGLAS_SEED).motivo,
    ).toBe('INSPECCION');
  });

  it('RN-04: ninguna prima disponible → solo ASESORIA por NO_ASEGURABLE', () => {
    expect(decidirDerivacion('PARTICULAR', false, REGLAS_SEED)).toEqual({
      opciones: ['ASESORIA'],
      motivo: 'NO_ASEGURABLE',
    });
  });

  it('basta que UNA aseguradora activa exija inspección', () => {
    const reglas = [
      regla('PARTICULAR', false),
      { ...regla('PARTICULAR', true), aseguradoraId: 'a2' },
    ];
    expect(decidirDerivacion('PARTICULAR', true, reglas).motivo).toBe(
      'INSPECCION',
    );
  });
});

describe('verificarNicho (RN-05)', () => {
  it('particular: hasta 2 vehículos', () => {
    expect(
      verificarNicho('PARTICULAR', { particular: 1, comercial: 0 }),
    ).toBeNull();
    expect(
      verificarNicho('PARTICULAR', { particular: 2, comercial: 0 }),
    ).toMatch(/hasta 2/);
  });

  it('comercial: hasta 5 (ligero y pasajeros cuentan juntos)', () => {
    expect(
      verificarNicho('COMERCIAL_LIGERO', { particular: 9, comercial: 4 }),
    ).toBeNull();
    expect(
      verificarNicho('TRANSPORTE_PASAJEROS', { particular: 0, comercial: 5 }),
    ).toMatch(/hasta 5/);
  });

  it('los particulares no cuentan para el cupo comercial', () => {
    expect(
      verificarNicho('COMERCIAL_LIGERO', { particular: 2, comercial: 0 }),
    ).toBeNull();
  });
});

describe('validarContraCatalogo (RF-03)', () => {
  const campo = (
    c: Partial<CampoFormulario> & { nombre: string },
  ): CampoFormulario => ({
    tipo: 'LISTA',
    obligatorio: true,
    origenValores: 'CATALOGO',
    valoresPermitidos: [],
    aseguradoras: ['Rímac'],
    ...c,
  });
  const CAMPOS = [
    campo({ nombre: 'marca' }),
    campo({ nombre: 'ubigeo', aseguradoras: ['Pacífico'] }),
    campo({
      nombre: 'clase',
      obligatorio: false,
      origenValores: 'ESTATICO',
      valoresPermitidos: ['Liviano', 'Pesado'],
    }),
    campo({
      nombre: 'placa',
      tipo: 'TEXTO',
      obligatorio: false,
      origenValores: 'ESTATICO',
    }),
  ];

  it('sin errores si están los obligatorios y los opcionales vacíos', () => {
    expect(
      validarContraCatalogo(
        { marca: 'm', ubigeo: '150122', clase: null },
        CAMPOS,
      ),
    ).toEqual([]);
  });

  it('obligatorio vacío → error con la ruta del body y quién lo pide', () => {
    expect(validarContraCatalogo({ marca: 'm', ubigeo: '  ' }, CAMPOS)).toEqual(
      [
        {
          campo: 'ubicacion.ubigeo',
          mensaje: 'Completa el distrito (lo pide Pacífico)',
        },
      ],
    );
  });

  it('lista estática con valor fuera de los permitidos → error', () => {
    const [e] = validarContraCatalogo(
      { marca: 'm', ubigeo: '150122', clase: 'Avión' },
      CAMPOS,
    );
    expect(e.campo).toBe('vehiculo.clase');
    expect(e.mensaje).toContain('Liviano, Pesado');
  });

  it('texto libre no se compara contra valores', () => {
    expect(
      validarContraCatalogo(
        { marca: 'm', ubigeo: '150122', placa: 'ABC-123' },
        CAMPOS,
      ),
    ).toEqual([]);
  });
});
