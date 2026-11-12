import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  type AgruparVentas,
  type Periodo,
  resolverPeriodo,
} from '../domain/reportes';
import {
  REPORTES_REPOSITORY,
  type ReportesRepository,
} from '../domain/reportes.repository.port';

export interface ConsultaPeriodo {
  desde?: string;
  hasta?: string;
}

/** Reportes del panel (doc conexión §6 "Reportes"); el cálculo vive en 0036. */
@Injectable()
export class ReportesService {
  constructor(
    @Inject(REPORTES_REPOSITORY) private readonly repo: ReportesRepository,
  ) {}

  ventas(token: string, q: ConsultaPeriodo & { agrupar?: AgruparVentas }) {
    return this.repo.ventas(token, this.periodo(q), q.agrupar ?? 'canal');
  }

  retencion(token: string, q: ConsultaPeriodo) {
    return this.repo.retencion(token, this.periodo(q));
  }

  descuentos(token: string, q: ConsultaPeriodo) {
    return this.repo.descuentos(token, this.periodo(q));
  }

  pruebaChoque(token: string, q: ConsultaPeriodo) {
    return this.repo.pruebaChoque(token, this.periodo(q));
  }

  miDesempeno(token: string, q: ConsultaPeriodo) {
    return this.repo.miDesempeno(token, this.periodo(q));
  }

  private periodo(q: ConsultaPeriodo): Periodo {
    const p = resolverPeriodo(q);
    if (typeof p === 'string') throw new BadRequestException(p);
    return p;
  }
}
