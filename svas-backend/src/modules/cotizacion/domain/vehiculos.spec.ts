import {
  agruparVehiculos,
  claveVehiculo,
  type VehiculoRegistrado,
} from './vehiculos';

const COROLLA = { id: 'm-corolla', nombre: 'Corolla' };
const TOYOTA = { id: 'marca-toyota', nombre: 'Toyota' };
const LIMA = {
  ubigeo: '150122',
  departamento: 'LIMA',
  provincia: 'LIMA',
  distrito: 'MIRAFLORES',
};

const fila = (extra: Partial<VehiculoRegistrado> = {}): VehiculoRegistrado => ({
  id: 'v1',
  anio: 2022,
  placa: 'ABC-123',
  clase: null,
  uso: 'PARTICULAR',
  creadoEn: '2026-11-01T10:00:00Z',
  marca: TOYOTA,
  modelo: COROLLA,
  ubicacion: LIMA,
  cotizaciones: [
    { id: 'c1', fecha: '2026-11-01T10:00:00Z', estado: 'REGISTRADA' },
  ],
  ...extra,
});

describe('claveVehiculo', () => {
  it('la placa con o sin guion y en minúsculas es el mismo auto', () => {
    const base = { modelo: COROLLA, anio: 2022 };
    expect(claveVehiculo({ ...base, placa: 'abc-123' })).toBe(
      claveVehiculo({ ...base, placa: 'ABC123' }),
    );
  });

  it('otro año, otro modelo u otra placa son otro auto', () => {
    const base = { modelo: COROLLA, anio: 2022, placa: 'ABC-123' };
    const clave = claveVehiculo(base);
    expect(claveVehiculo({ ...base, anio: 2021 })).not.toBe(clave);
    expect(
      claveVehiculo({ ...base, modelo: { id: 'otro', nombre: 'Yaris' } }),
    ).not.toBe(clave);
    expect(claveVehiculo({ ...base, placa: 'XYZ-999' })).not.toBe(clave);
  });
});

describe('agruparVehiculos', () => {
  it('sin vehículos devuelve una lista vacía', () => {
    expect(agruparVehiculos([])).toEqual([]);
  });

  it('un solo auto cotizado una vez', () => {
    const [v] = agruparVehiculos([fila()]);
    expect(v).toMatchObject({
      marca: TOYOTA,
      modelo: COROLLA,
      anio: 2022,
      placa: 'ABC-123',
      uso: 'PARTICULAR',
      ubicacion: LIMA,
      cotizaciones: 1,
      ultimaCotizacion: '2026-11-01T10:00:00Z',
      asegurado: false,
    });
  });

  it('el mismo auto cotizado varias veces sale UNA vez, con la cuenta y la fecha más reciente', () => {
    const r = agruparVehiculos([
      fila({
        id: 'v1',
        cotizaciones: [
          { id: 'c1', fecha: '2026-10-01T10:00:00Z', estado: 'REGISTRADA' },
        ],
      }),
      fila({
        id: 'v2',
        creadoEn: '2026-11-10T10:00:00Z',
        placa: 'abc123',
        cotizaciones: [
          { id: 'c2', fecha: '2026-11-10T10:00:00Z', estado: 'NO_CONCRETADA' },
          { id: 'c3', fecha: '2026-11-12T10:00:00Z', estado: 'REGISTRADA' },
        ],
      }),
    ]);

    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      cotizaciones: 3,
      ultimaCotizacion: '2026-11-12T10:00:00Z',
    });
  });

  it('los datos del auto son los de la fila más reciente (uso, clase y ubicación)', () => {
    const [v] = agruparVehiculos([
      fila({
        id: 'viejo',
        creadoEn: '2026-09-01T10:00:00Z',
        uso: 'PARTICULAR',
        clase: null,
        ubicacion: LIMA,
      }),
      fila({
        id: 'nuevo',
        creadoEn: '2026-11-01T10:00:00Z',
        uso: 'COMERCIAL_LIGERO',
        clase: 'Camioneta',
        ubicacion: { ...LIMA, distrito: 'SURCO', ubigeo: '150140' },
      }),
    ]);

    expect(v).toMatchObject({ uso: 'COMERCIAL_LIGERO', clase: 'Camioneta' });
    expect(v!.ubicacion!.distrito).toBe('SURCO');
  });

  it('el mismo modelo y año sin placa no se mezcla con el que tiene placa (pueden ser autos distintos)', () => {
    const r = agruparVehiculos([
      fila({ id: 'con', placa: 'ABC-123' }),
      fila({ id: 'sin', placa: null }),
    ]);
    expect(r.map((v) => v.placa).sort()).toEqual(['ABC-123', null]);
  });

  it('está asegurado si alguna cotización del auto se convirtió en póliza', () => {
    const [v] = agruparVehiculos([
      fila({
        cotizaciones: [
          { id: 'c1', fecha: '2026-10-01T10:00:00Z', estado: 'REGISTRADA' },
          { id: 'c2', fecha: '2026-11-01T10:00:00Z', estado: 'CONVERTIDA' },
        ],
      }),
    ]);
    expect(v!.asegurado).toBe(true);
  });

  it('autos distintos quedan separados, el cotizado más recientemente primero', () => {
    const yaris = { id: 'm-yaris', nombre: 'Yaris' };
    const r = agruparVehiculos([
      fila({
        id: 'a',
        cotizaciones: [
          { id: 'c1', fecha: '2026-09-01T10:00:00Z', estado: 'REGISTRADA' },
        ],
      }),
      fila({
        id: 'b',
        modelo: yaris,
        placa: 'XYZ-999',
        cotizaciones: [
          { id: 'c2', fecha: '2026-11-15T10:00:00Z', estado: 'REGISTRADA' },
        ],
      }),
    ]);

    expect(r.map((v) => v.modelo.nombre)).toEqual(['Yaris', 'Corolla']);
  });

  it('un auto sin cotizaciones usa la fecha en que se registró', () => {
    const [v] = agruparVehiculos([
      fila({ cotizaciones: [], creadoEn: '2026-08-08T10:00:00Z' }),
    ]);
    expect(v).toMatchObject({
      cotizaciones: 0,
      ultimaCotizacion: '2026-08-08T10:00:00Z',
    });
  });

  it('un auto sin ubicación registrada no rompe', () => {
    const [v] = agruparVehiculos([fila({ ubicacion: null })]);
    expect(v!.ubicacion).toBeNull();
  });
});
