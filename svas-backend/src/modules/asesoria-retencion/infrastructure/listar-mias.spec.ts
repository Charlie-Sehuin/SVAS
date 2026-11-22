import { ErrorBaseDatos } from '../../../common/filters/postgrest-error.filter';
import type { SupabaseServiceClient } from '../../../infrastructure/database/supabase-service-client.provider';
import type { SupabaseUserClientFactory } from '../../../infrastructure/database/supabase-user-client.factory';
import { AsesoriaSupabaseRepository } from './asesoria-supabase.repository';

/** Cliente de Supabase falso: devuelve `respuesta` al final de la cadena from → select → order → limit. */
function repoCon(respuesta: { data: unknown; error: unknown }) {
  const cadena = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(respuesta),
  };
  const paraToken = jest.fn().mockReturnValue(cadena);
  const repo = new AsesoriaSupabaseRepository(
    {} as SupabaseServiceClient,
    { paraToken } as unknown as SupabaseUserClientFactory,
  );
  return { repo, cadena, paraToken };
}

const fila = (extra: Record<string, unknown> = {}) => ({
  id: 's1',
  motivo: 'DUDA',
  estado: 'EN_ATENCION',
  canal: 'WHATSAPP',
  origen: 'CLIENTE',
  fecha_creacion: '2026-11-20T10:00:00-05:00',
  asesor_id: 'asesor-secreto',
  cotizacion: {
    id: 'c1',
    fecha: '2026-11-19T10:00:00-05:00',
    estado: 'REGISTRADA',
    vehiculo: {
      anio: 2022,
      modelo: { nombre: 'Corolla', marca: { nombre: 'Toyota' } },
    },
    descuento: [],
  },
  ...extra,
});

describe('AsesoriaSupabaseRepository.listarMias', () => {
  it('pide las solicitudes como el propio usuario, las más nuevas primero', async () => {
    const { repo, cadena, paraToken } = repoCon({ data: [], error: null });

    expect(await repo.listarMias('jwt-del-cliente')).toEqual([]);

    expect(paraToken).toHaveBeenCalledWith('jwt-del-cliente');
    expect(cadena.from).toHaveBeenCalledWith('solicitud_asesoria');
    expect(cadena.order).toHaveBeenCalledWith('fecha_creacion', {
      ascending: false,
    });
  });

  it('no pide datos personales ni del cliente (solo lo que se muestra)', async () => {
    const { repo, cadena } = repoCon({ data: [], error: null });
    await repo.listarMias('jwt');

    const columnas = (cadena.select.mock.calls[0] as [string])[0];
    expect(columnas).not.toMatch(/telefono|email|numero_documento|resultado/);
    expect(columnas).not.toMatch(/cliente\(/);
  });

  it('arma la vista del cliente: vehículo legible y sin el id del asesor', async () => {
    const { repo } = repoCon({ data: [fila()], error: null });

    const [s] = await repo.listarMias('jwt');

    expect(s).toEqual({
      id: 's1',
      motivo: 'DUDA',
      estado: 'EN_ATENCION',
      canal: 'WHATSAPP',
      origen: 'CLIENTE',
      fechaCreacion: '2026-11-20T10:00:00-05:00',
      conAsesor: true,
      cotizacion: {
        id: 'c1',
        fecha: '2026-11-19T10:00:00-05:00',
        estado: 'REGISTRADA',
        vehiculo: 'Toyota Corolla 2022',
      },
      descuentoAceptado: null,
    });
    expect(JSON.stringify(s)).not.toContain('asesor-secreto');
  });

  it('una solicitud sin tomar sale con conAsesor en false', async () => {
    const { repo } = repoCon({
      data: [fila({ estado: 'PENDIENTE', asesor_id: null })],
      error: null,
    });
    expect((await repo.listarMias('jwt'))[0]!.conAsesor).toBe(false);
  });

  it('muestra solo el descuento aceptado (el vigente), con dos decimales', async () => {
    const base = fila();
    const { repo } = repoCon({
      data: [
        {
          ...base,
          cotizacion: {
            ...base.cotizacion,
            descuento: [
              { tipo: 'NEGOCIADO', porcentaje: '5', aceptado: false },
              { tipo: 'NEGOCIADO', porcentaje: 8, aceptado: true },
            ],
          },
        },
      ],
      error: null,
    });

    expect((await repo.listarMias('jwt'))[0]!.descuentoAceptado).toEqual({
      tipo: 'NEGOCIADO',
      porcentaje: '8.00',
    });
  });

  it('acepta que PostgREST devuelva las relaciones como arreglo de un elemento', async () => {
    const base = fila();
    const { repo } = repoCon({
      data: [
        {
          ...base,
          cotizacion: [
            {
              ...base.cotizacion,
              vehiculo: [
                {
                  anio: 2020,
                  modelo: [{ nombre: 'Rio', marca: [{ nombre: 'Kia' }] }],
                },
              ],
            },
          ],
        },
      ],
      error: null,
    });
    expect((await repo.listarMias('jwt'))[0]!.cotizacion.vehiculo).toBe(
      'Kia Rio 2020',
    );
  });

  it('si la base responde con error, lo propaga como ErrorBaseDatos', async () => {
    const { repo } = repoCon({ data: null, error: { message: 'falló' } });
    await expect(repo.listarMias('jwt')).rejects.toBeInstanceOf(ErrorBaseDatos);
  });
});
