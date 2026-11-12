import Decimal from 'decimal.js';
import { Dinero, redondear } from '../../../common/utils/money.util';
import type { UsoVehiculo, VariablePerfil } from '../../../shared/types/enums';

/**
 * Motor de la Prueba de Choque (contexto §16.3). Función pura: no lee la base
 * ni la hora; todo lo que usa llega en la entrada. Montos en USD.
 */

export const LEYENDA_SIMULACION =
  'Estimación referencial basada en condiciones resumidas. Prevalece el condicionado de la aseguradora.'; // RN-29

/** Tope de probabilidad tras aplicar los factores del perfil (§16.3). */
export const PROBABILIDAD_MAXIMA = new Dinero('0.95');

export interface EscenarioMotor {
  id: string;
  codigo: string;
  /** null en ROBO_TOTAL / PERDIDA_TOTAL: el daño es la suma asegurada del plan. */
  montoDano: Decimal | null;
  diasTaller: number;
}

export interface ReglaMotor {
  planId: string;
  escenarioId: string;
  cubre: boolean;
  deduciblePct: Decimal | null; // 0–100
  deducibleMinimo: Decimal | null;
  /** null = hasta la suma asegurada. */
  tope: Decimal | null;
  diasReemplazo: number;
}

export interface PrimaMotor {
  primaCotizadaId: string;
  planId: string;
  prima: Decimal;
  sumaAsegurada: Decimal;
}

export interface PerfilMotor {
  estacionaCochera: boolean;
  kmMesAlto: boolean;
  usoNocturno: boolean;
  ingresoDiarioSoles: Decimal | null;
}

export interface EntradaMotor {
  uso: UsoVehiculo;
  primas: PrimaMotor[];
  escenarios: EscenarioMotor[];
  reglas: ReglaMotor[];
  /** Probabilidad anual por escenario para el uso y la zona de la cotización. */
  probabilidades: Map<string, Decimal>;
  factores: {
    escenarioId: string;
    variable: VariablePerfil;
    multiplicador: Decimal;
  }[];
  perfil: PerfilMotor;
  /** Soles por dólar, para pasar el ingreso diario a USD. */
  tipoCambio: Decimal;
}

export interface ResultadoEscenario {
  primaCotizadaId: string;
  escenarioId: string;
  sinDato: boolean;
  cubre: boolean | null;
  probabilidad: Decimal;
  dano: Decimal;
  cubierto: Decimal;
  deducible: Decimal;
  noCubierto: Decimal;
  ingresoPerdido: Decimal;
  desembolso: Decimal;
}

export interface ResultadoPlan {
  primaCotizadaId: string;
  prima: Decimal;
  desembolsoEsperado: Decimal;
  costoRealAnual: Decimal;
  peorCaso: Decimal;
  datosCompletos: boolean;
  ranking: number;
}

export interface SalidaMotor {
  planes: ResultadoPlan[];
  resultados: ResultadoEscenario[];
}

const CERO = new Dinero(0);
const VARIABLE_ACTIVA: Record<VariablePerfil, keyof PerfilMotor> = {
  ESTACIONA_COCHERA: 'estacionaCochera',
  KM_MES_ALTO: 'kmMesAlto',
  USO_NOCTURNO: 'usoNocturno',
};

/** pe = frecuencia × Π factores del perfil, acotada a 0,95 y a 4 decimales (numeric(6,4)). */
export function probabilidadAjustada(
  e: EntradaMotor,
  escenarioId: string,
): Decimal {
  let p = new Dinero(e.probabilidades.get(escenarioId) ?? 0);
  for (const f of e.factores) {
    if (
      f.escenarioId === escenarioId &&
      e.perfil[VARIABLE_ACTIVA[f.variable]] === true
    ) {
      p = p.times(f.multiplicador);
    }
  }
  return Decimal.min(p, PROBABILIDAD_MAXIMA).toDecimalPlaces(
    4,
    Decimal.ROUND_HALF_UP,
  );
}

/** RN-33: solo en uso comercial y si el cliente declaró su ingreso. En USD por día. */
function ingresoDiarioUsd(e: EntradaMotor): Decimal | null {
  if (e.uso === 'PARTICULAR' || !e.perfil.ingresoDiarioSoles) return null;
  if (e.perfil.ingresoDiarioSoles.lte(0) || e.tipoCambio.lte(0)) return null;
  return e.perfil.ingresoDiarioSoles.div(e.tipoCambio);
}

export function calcularEscenario(
  e: EntradaMotor,
  prima: PrimaMotor,
  escenario: EscenarioMotor,
  probabilidad: Decimal,
): ResultadoEscenario {
  const dano = redondear(escenario.montoDano ?? prima.sumaAsegurada);
  const regla = e.reglas.find(
    (r) => r.planId === prima.planId && r.escenarioId === escenario.id,
  );
  const base = {
    primaCotizadaId: prima.primaCotizadaId,
    escenarioId: escenario.id,
    probabilidad,
    dano,
  };

  // RN-30: sin regla no se supone nada; el escenario no entra al CRA.
  if (!regla) {
    return {
      ...base,
      sinDato: true,
      cubre: null,
      cubierto: CERO,
      deducible: CERO,
      noCubierto: CERO,
      ingresoPerdido: CERO,
      desembolso: CERO,
    };
  }

  let deducible = CERO;
  let noCubierto = dano;
  if (regla.cubre) {
    const porPct = dano.times(regla.deduciblePct ?? 0).div(100);
    deducible = redondear(
      Decimal.min(dano, Decimal.max(porPct, regla.deducibleMinimo ?? 0)),
    );
    // exceso = max(0, D − tope); sin tope, el límite es la suma asegurada.
    const limite = regla.tope ?? prima.sumaAsegurada;
    noCubierto = redondear(
      Decimal.min(dano.minus(deducible), Decimal.max(0, dano.minus(limite))),
    );
  }
  const pago = deducible.plus(noCubierto); // nunca supera D
  const cubierto = Decimal.max(0, dano.minus(pago));

  const ingresoDia = ingresoDiarioUsd(e);
  const diasSinAuto = Math.max(
    0,
    escenario.diasTaller - (regla.cubre ? regla.diasReemplazo : 0),
  );
  const ingresoPerdido = ingresoDia
    ? redondear(ingresoDia.times(diasSinAuto))
    : CERO;

  return {
    ...base,
    sinDato: false,
    cubre: regla.cubre,
    cubierto,
    deducible,
    noCubierto,
    ingresoPerdido,
    desembolso: pago.plus(ingresoPerdido),
  };
}

/** RN-34: CRA ascendente, empate → menor prima; incompletos al final. */
export function ordenar(
  planes: Omit<ResultadoPlan, 'ranking'>[],
): ResultadoPlan[] {
  return [...planes]
    .sort(
      (a, b) =>
        Number(a.datosCompletos === false) -
          Number(b.datosCompletos === false) ||
        a.costoRealAnual.comparedTo(b.costoRealAnual) ||
        a.prima.comparedTo(b.prima) ||
        a.primaCotizadaId.localeCompare(b.primaCotizadaId),
    )
    .map((p, i) => ({ ...p, ranking: i + 1 }));
}

export function simular(e: EntradaMotor): SalidaMotor {
  const probabilidades = new Map(
    e.escenarios.map((esc) => [esc.id, probabilidadAjustada(e, esc.id)]),
  );
  const resultados: ResultadoEscenario[] = [];
  const planes = e.primas.map((prima) => {
    const propios = e.escenarios.map((esc) =>
      calcularEscenario(e, prima, esc, probabilidades.get(esc.id)!),
    );
    resultados.push(...propios);
    const conDato = propios.filter((r) => !r.sinDato);
    const esperado = conDato.reduce<Decimal>(
      (acc, r) => acc.plus(r.probabilidad.times(r.desembolso)),
      CERO,
    );
    return {
      primaCotizadaId: prima.primaCotizadaId,
      prima: prima.prima,
      desembolsoEsperado: redondear(esperado),
      costoRealAnual: redondear(prima.prima.plus(esperado)),
      peorCaso: conDato.reduce<Decimal>(
        (m, r) => Decimal.max(m, r.desembolso),
        CERO,
      ),
      datosCompletos: conDato.length === propios.length,
    };
  });
  return { planes: ordenar(planes), resultados };
}
