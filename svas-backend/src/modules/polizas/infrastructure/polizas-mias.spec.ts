import type { SupabaseServiceClient } from '../../../infrastructure/database/supabase-service-client.provider';
import type { SupabaseUserClientFactory } from '../../../infrastructure/database/supabase-user-client.factory';
import { PolizasSupabaseRepository } from './polizas-supabase.repository';

/** Cliente de Supabase falso: devuelve `respuesta` al final de from → select → order. */
function repoCon(respuesta: { data: unknown; error: unknown }) {
  const cadena = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue(respuesta),
  };
  const repo = new PolizasSupabaseRepository(
    {
      paraToken: jest.fn().mockReturnValue(cadena),
    } as unknown as SupabaseUserClientFactory,
    {} as SupabaseServiceClient,
  );
  return { repo, cadena };
}

const cuota = (numero: number, estado: string, venc: string) => ({
  numero,
  monto: numero === 4 ? '54.17' : 54.18,
  fecha_vencimiento: venc,
  estado,
});

const fila = (pago: Record<string, unknown> | null) => ({
  id: 'p1',
  numero: 'LAP-2026-A1B2C3D4',
  fecha_emision: '2026-11-12T15:00:00-05:00',
  pdf_generado_en: '2026-11-12T15:01:00-05:00',
  orden_compra: {
    id: 'orden-1',
    prima_final: 650.16,
    contenido_plan: { aseguradora: 'La Positiva', plan: 'Full' },
    prima_cotizada: { suma_asegurada: 15000 },
    cotizacion: {
      vehiculo: {
        anio: 2022,
        placa: 'ABC-123',
        modelo: { nombre: 'Corolla', marca: { nombre: 'Toyota' } },
      },
    },
    pago: pago ? [pago] : [],
  },
});

describe('PolizasSupabaseRepository.mias', () => {
  it('pide las cuotas junto con el pago, como el propio cliente', async () => {
    const { repo, cadena } = repoCon({ data: [], error: null });
    await repo.mias('jwt');

    const columnas = (cadena.select.mock.calls[0] as [string])[0];
    expect(columnas).toContain(
      'cuota(numero, monto, fecha_vencimiento, estado)',
    );
    expect(columnas).toMatch(/orden_compra!inner\(\s*id,/);
  });

  it('devuelve el id de la compra (con él se pagan las cuotas) y el cronograma ordenado', async () => {
    const { repo } = repoCon({
      data: [
        fila({
          modo: 'CUOTAS',
          monto: 216.7,
          numero_cuotas: 4,
          estado: 'CONFIRMADO',
          cuota: [
            cuota(3, 'PENDIENTE', '2999-01-12'),
            cuota(1, 'CONFIRMADO', '2026-11-12'),
            cuota(4, 'PENDIENTE', '2999-02-12'),
            cuota(2, 'PENDIENTE', '2000-01-12'),
          ],
        }),
      ],
      error: null,
    });

    const [p] = await repo.mias('jwt');

    expect(p!.ordenId).toBe('orden-1');
    expect(p!.pago!.cuotas.map((c) => c.numero)).toEqual([1, 2, 3, 4]);
    expect(p!.pago!.cuotas.map((c) => c.monto)).toEqual([
      '54.18',
      '54.18',
      '54.18',
      '54.17',
    ]);
  });

  it('da los días para vencer solo a las pendientes: negativo si ya venció, null si ya se pagó', async () => {
    const { repo } = repoCon({
      data: [
        fila({
          modo: 'CUOTAS',
          monto: 216.7,
          numero_cuotas: 3,
          estado: 'CONFIRMADO',
          cuota: [
            cuota(1, 'CONFIRMADO', '2026-11-12'),
            cuota(2, 'PENDIENTE', '2000-01-12'),
            cuota(3, 'PENDIENTE', '2999-01-12'),
          ],
        }),
      ],
      error: null,
    });

    const cuotas = (await repo.mias('jwt'))[0]!.pago!.cuotas;

    expect(cuotas[0]!.diasParaVencer).toBeNull();
    expect(cuotas[1]!.diasParaVencer).toBeLessThan(0);
    expect(cuotas[2]!.diasParaVencer).toBeGreaterThan(0);
  });

  it('un pago al contado no trae cuotas', async () => {
    const { repo } = repoCon({
      data: [
        fila({
          modo: 'UNICO',
          monto: 619.2,
          numero_cuotas: null,
          estado: 'CONFIRMADO',
        }),
      ],
      error: null,
    });

    const [p] = await repo.mias('jwt');

    expect(p!.pago).toMatchObject({ modo: 'UNICO', cuotas: [] });
  });
});
