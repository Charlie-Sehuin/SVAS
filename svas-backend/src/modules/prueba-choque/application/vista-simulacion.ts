import Decimal from 'decimal.js';
import { aJson } from '../../../common/utils/money.util';
import { LEYENDA_SIMULACION } from '../domain/motor-simulacion';
import type { SimulacionGuardada } from '../domain/prueba-choque.repository.port';

export interface WarningSimulacion {
  code: 'DATOS_COBERTURA_INCOMPLETOS';
  message: string;
}

/**
 * Respuesta de POST/GET /cotizaciones/:id/prueba-choque (doc conexión §6)
 * armada SOLO desde la instantánea (RN-32). desembolsoEsperado se recalcula
 * de los resultados guardados para que prima + esperado = CRA aunque la
 * prima de la cotización haya cambiado después (simulación no vigente).
 */
export function armarRespuesta(s: SimulacionGuardada) {
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

  const planes = [...s.planes].sort((a, b) => a.ranking - b.ranking);
  const orden = new Map(planes.map((p, i) => [p.primaCotizadaId, i]));

  const escenarios = new Map<string, SimulacionGuardada['resultados']>();
  for (const r of s.resultados) {
    const lista = escenarios.get(r.escenario.id) ?? [];
    lista.push(r);
    escenarios.set(r.escenario.id, lista);
  }

  return {
    id: s.id,
    zona: s.zona,
    moneda: 'USD',
    vigente: s.vigente,
    fecha: s.fecha,
    ranking: planes.map((p) => {
      const esp = (
        esperado.get(p.primaCotizadaId) ?? new Decimal(0)
      ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      return {
        primaCotizadaId: p.primaCotizadaId,
        aseguradora: p.aseguradora,
        plan: p.plan,
        prima: aJson(p.costoRealAnual.minus(esp)),
        desembolsoEsperado: aJson(esp),
        costoRealAnual: aJson(p.costoRealAnual),
        peorCaso: aJson(p.peorCaso),
        datosCompletos: p.datosCompletos,
        posicion: p.ranking,
      };
    }),
    matriz: [...escenarios.values()]
      .sort((a, b) => a[0]!.escenario.orden - b[0]!.escenario.orden)
      .map((lista) => ({
        escenario: {
          codigo: lista[0]!.escenario.codigo,
          nombre: lista[0]!.escenario.nombre,
          probabilidad: lista[0]!.probabilidad.toFixed(4),
        },
        resultados: [...lista]
          .sort(
            (a, b) =>
              (orden.get(a.primaCotizadaId) ?? 0) -
              (orden.get(b.primaCotizadaId) ?? 0),
          )
          .map((r) => ({
            primaCotizadaId: r.primaCotizadaId,
            cubre: r.cubre,
            deducible: aJson(r.deducible),
            noCubierto: aJson(r.noCubierto),
            ingresoPerdido: aJson(r.ingresoPerdido),
            desembolso: aJson(r.desembolso),
            sinDato: r.sinDato,
          })),
      })),
    leyenda: LEYENDA_SIMULACION,
  };
}

/** RN-30: "No tenemos información de robo total para 1 plan." */
export function warningIncompletos(
  s: SimulacionGuardada,
): WarningSimulacion | undefined {
  const faltan = new Map<string, number>();
  for (const r of s.resultados) {
    if (r.sinDato)
      faltan.set(r.escenario.nombre, (faltan.get(r.escenario.nombre) ?? 0) + 1);
  }
  if (faltan.size === 0) return undefined;
  const partes = [...faltan].map(
    ([nombre, n]) =>
      `${nombre.toLowerCase()} para ${n} plan${n === 1 ? '' : 'es'}`,
  );
  return {
    code: 'DATOS_COBERTURA_INCOMPLETOS',
    message: `No tenemos información de ${partes.join(' ni de ')}.`,
  };
}
