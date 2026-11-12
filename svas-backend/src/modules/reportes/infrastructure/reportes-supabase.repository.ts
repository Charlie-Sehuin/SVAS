import { Injectable } from '@nestjs/common';
import { llamarRpc } from '../../../infrastructure/database/rpc.helper';
import { SupabaseUserClientFactory } from '../../../infrastructure/database/supabase-user-client.factory';
import type { AgruparVentas, Periodo } from '../domain/reportes';
import type {
  Reporte,
  ReportesRepository,
} from '../domain/reportes.repository.port';

/** RPC de 0036 con el JWT del usuario (exigen ADMINISTRADOR o ASESOR). */
@Injectable()
export class ReportesSupabaseRepository implements ReportesRepository {
  constructor(private readonly usuarios: SupabaseUserClientFactory) {}

  ventas(token: string, p: Periodo, agrupar: AgruparVentas) {
    return this.rpc(token, 'reporte_ventas', p, { p_agrupar: agrupar });
  }

  retencion(token: string, p: Periodo) {
    return this.rpc(token, 'reporte_retencion', p);
  }

  descuentos(token: string, p: Periodo) {
    return this.rpc(token, 'reporte_descuentos', p);
  }

  pruebaChoque(token: string, p: Periodo) {
    return this.rpc(token, 'reporte_prueba_choque', p);
  }

  miDesempeno(token: string, p: Periodo) {
    return this.rpc(token, 'reporte_mi_desempeno', p);
  }

  private rpc(
    token: string,
    nombre: string,
    p: Periodo,
    extra: Record<string, unknown> = {},
  ): Promise<Reporte> {
    return llamarRpc<Reporte>(this.usuarios.paraToken(token), nombre, {
      p_desde: p.desde,
      p_hasta: p.hasta,
      ...extra,
    });
  }
}
