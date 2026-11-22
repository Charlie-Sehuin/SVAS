import { ErrorBaseDatos } from '../../../common/filters/postgrest-error.filter';
import type { SupabaseServiceClient } from '../../../infrastructure/database/supabase-service-client.provider';
import type { SupabaseUserClientFactory } from '../../../infrastructure/database/supabase-user-client.factory';
import { CotizacionSupabaseRepository } from './cotizacion-supabase.repository';

/** Cliente de Supabase falso: devuelve `respuesta` al final de from → select → order → limit. */
function repoCon(respuesta: { data: unknown; error: unknown }) {
  const cadena = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(respuesta),
  };
  const paraToken = jest.fn().mockReturnValue(cadena);
  const repo = new CotizacionSupabaseRepository(
    {} as SupabaseServiceClient,
    { paraToken } as unknown as SupabaseUserClientFactory,
  );
  return { repo, cadena, paraToken };
}

const fila = (extra: Record<string, unknown> = {}) => ({
  id: 'v1',
  anio: 2022,
  placa: 'ABC-123',
  clase: 'Automóvil',
  uso: 'PARTICULAR',
  creado_en: '2026-11-01T10:00:00Z',
  modelo: {
    id: 'm1',
    nombre: 'Corolla',
    marca: { id: 'ma1', nombre: 'Toyota' },
  },
  ubicacion_uso: {
    ubigeo: {
      codigo: '150122',
      departamento: 'LIMA',
      provincia: 'LIMA',
      distrito: 'MIRAFLORES',
    },
  },
  cotizacion: [
    { id: 'c1', fecha: '2026-11-01T10:00:00Z', estado: 'REGISTRADA' },
  ],
  ...extra,
});

describe('CotizacionSupabaseRepository.listarVehiculos', () => {
  it('pide los vehículos como el propio usuario (la RLS deja solo los suyos)', async () => {
    const { repo, cadena, paraToken } = repoCon({ data: [], error: null });

    expect(await repo.listarVehiculos('jwt-del-cliente')).toEqual([]);

    expect(paraToken).toHaveBeenCalledWith('jwt-del-cliente');
    expect(cadena.from).toHaveBeenCalledWith('vehiculo');
    expect(cadena.order).toHaveBeenCalledWith('creado_en', {
      ascending: false,
    });
  });

  it('no pide datos personales del cliente (solo el auto y dónde circula)', async () => {
    const { repo, cadena } = repoCon({ data: [], error: null });
    await repo.listarVehiculos('jwt');

    const columnas = (cadena.select.mock.calls[0] as [string])[0];
    expect(columnas).not.toMatch(
      /telefono|email|numero_documento|nombres|apellidos|cliente\(/,
    );
  });

  it('arma el vehículo con su marca, modelo, ubicación y cotizaciones', async () => {
    const { repo } = repoCon({ data: [fila()], error: null });

    const [v] = await repo.listarVehiculos('jwt');

    expect(v).toEqual({
      id: 'v1',
      anio: 2022,
      placa: 'ABC-123',
      clase: 'Automóvil',
      uso: 'PARTICULAR',
      creadoEn: '2026-11-01T10:00:00Z',
      marca: { id: 'ma1', nombre: 'Toyota' },
      modelo: { id: 'm1', nombre: 'Corolla' },
      ubicacion: {
        ubigeo: '150122',
        departamento: 'LIMA',
        provincia: 'LIMA',
        distrito: 'MIRAFLORES',
      },
      cotizaciones: [
        { id: 'c1', fecha: '2026-11-01T10:00:00Z', estado: 'REGISTRADA' },
      ],
    });
  });

  it('acepta que PostgREST devuelva las relaciones como arreglo de un elemento', async () => {
    const f = fila();
    const { repo } = repoCon({
      data: [
        {
          ...f,
          modelo: [{ ...f.modelo, marca: [f.modelo.marca] }],
          ubicacion_uso: [{ ubigeo: [f.ubicacion_uso.ubigeo] }],
        },
      ],
      error: null,
    });

    const [v] = await repo.listarVehiculos('jwt');

    expect(v!.marca.nombre).toBe('Toyota');
    expect(v!.ubicacion!.distrito).toBe('MIRAFLORES');
  });

  it('un vehículo sin ubicación queda con ubicación null', async () => {
    const { repo } = repoCon({
      data: [fila({ ubicacion_uso: null })],
      error: null,
    });
    expect((await repo.listarVehiculos('jwt'))[0]!.ubicacion).toBeNull();
  });

  it('descarta una fila sin modelo o marca (no hay auto que mostrar)', async () => {
    const { repo } = repoCon({
      data: [
        fila({ modelo: null }),
        fila({ id: 'v2', modelo: { id: 'm', nombre: 'X', marca: null } }),
        fila({ id: 'v3' }),
      ],
      error: null,
    });
    expect((await repo.listarVehiculos('jwt')).map((v) => v.id)).toEqual([
      'v3',
    ]);
  });

  it('si la base responde con error, lo propaga como ErrorBaseDatos', async () => {
    const { repo } = repoCon({ data: null, error: { message: 'falló' } });
    await expect(repo.listarVehiculos('jwt')).rejects.toBeInstanceOf(
      ErrorBaseDatos,
    );
  });
});
