import { BadRequestException } from '@nestjs/common';
import type { TarifaRepository } from '../../cotizacion/domain/tarifa.repository.port';
import type { PlanTarifa } from '../../cotizacion/domain/tarifa.types';

export const PLAN_NO_DISPONIBLE = 'Ese plan ya no está disponible para comprar';

/** El plan de la tarifa vigente: la Estrategia lo necesita para el total en cuotas (RN-38). */
export async function planTarifa(
  tarifas: TarifaRepository,
  aseguradoraId: string,
  planId: string,
): Promise<PlanTarifa> {
  const plan = (await tarifas.cargar(aseguradoraId)).planes.find(
    (p) => p.planId === planId,
  );
  if (!plan) throw new BadRequestException(PLAN_NO_DISPONIBLE);
  return plan;
}
