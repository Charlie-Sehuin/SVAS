import Decimal from 'decimal.js';
import type { SimulacionGuardada } from './prueba-choque.repository.port';

/**
 * Desembolso esperado por plan (Σ probabilidad × desembolso) desde la
 * instantánea (RN-32). prima = costo real anual − esperado.
 */
export function esperadoPorPlan(s: SimulacionGuardada): Map<string, Decimal> {
  const esperado = new Map<string, Decimal>();
  for (const r of s.resultados) {
    if (r.sinDato) continue;
    esperado.set(
      r.primaCotizadaId,
      (esperado.get(r.primaCotizadaId) ?? new Decimal(0)).plus(
        r.probabilidad.times(r.desembolso),
      ),
    );
  }
  for (const [id, v] of esperado) {
    esperado.set(id, v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  }
  return esperado;
}

export interface Contraste {
  escenario: string;
  barato: { aseguradora: string; plan: string; desembolso: Decimal };
  otro: { aseguradora: string; plan: string; desembolso: Decimal };
}

/** "USD 1,234.50" */
export function textoUsd(monto: Decimal): string {
  const [entero, dec] = monto.toFixed(2).split('.');
  return `USD ${entero!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
}

/**
 * RN-35: el escenario donde el plan más barato deja al cliente pagando más
 * que otro plan cotizado, con la mayor diferencia. null si la simulación ya
 * no está vigente (RN-37) o si el más barato nunca sale peor.
 * Empates: el otro plan con mejor ranking y luego el escenario de menor orden.
 */
export function contrasteRetencion(s: SimulacionGuardada): Contraste | null {
  if (!s.vigente || s.planes.length < 2) return null;

  const esperado = esperadoPorPlan(s);
  const prima = (p: SimulacionGuardada['planes'][number]) =>
    p.costoRealAnual.minus(esperado.get(p.primaCotizadaId) ?? 0);
  const barato = [...s.planes].sort(
    (a, b) => prima(a).comparedTo(prima(b)) || a.ranking - b.ranking,
  )[0]!;

  const resultado = new Map(
    s.resultados.map((r) => [`${r.primaCotizadaId}:${r.escenario.id}`, r]),
  );
  const otros = s.planes
    .filter((p) => p.primaCotizadaId !== barato.primaCotizadaId)
    .sort((a, b) => a.ranking - b.ranking);
  const escenarios = [
    ...new Map(s.resultados.map((r) => [r.escenario.id, r.escenario])).values(),
  ].sort((a, b) => a.orden - b.orden);

  let mejor: (Contraste & { diferencia: Decimal }) | null = null;
  for (const otro of otros) {
    for (const e of escenarios) {
      const rb = resultado.get(`${barato.primaCotizadaId}:${e.id}`);
      const ro = resultado.get(`${otro.primaCotizadaId}:${e.id}`);
      if (!rb || !ro || rb.sinDato || ro.sinDato) continue; // RN-30
      const diferencia = rb.desembolso.minus(ro.desembolso);
      if (diferencia.lte(0) || (mejor && diferencia.lte(mejor.diferencia))) {
        continue;
      }
      mejor = {
        diferencia,
        escenario: e.nombre,
        barato: {
          aseguradora: barato.aseguradora,
          plan: barato.plan,
          desembolso: rb.desembolso,
        },
        otro: {
          aseguradora: otro.aseguradora,
          plan: otro.plan,
          desembolso: ro.desembolso,
        },
      };
    }
  }
  if (!mejor) return null;
  const { diferencia: _, ...contraste } = mejor;
  return contraste;
}

/** La frase que va en el mensaje final y en el PDF de la simulación. */
export function fraseContraste(c: Contraste): string {
  return (
    `Con el plan más barato (${c.barato.aseguradora} ${c.barato.plan}) pagarías ` +
    `${textoUsd(c.barato.desembolso)} de tu bolsillo en un caso de ` +
    `${c.escenario.toLocaleLowerCase('es')}; con ${c.otro.aseguradora} ` +
    `${c.otro.plan}, ${textoUsd(c.otro.desembolso)}.`
  );
}
