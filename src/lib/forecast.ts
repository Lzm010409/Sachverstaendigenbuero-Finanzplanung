import { addDays, isoDate, startOfDayUTC } from "./dates";
import { occurrencesBetween, type Recurrence } from "./recurrence";

export interface ForecastPlannedItem {
  id?: string;
  name?: string;
  amount: number; // Cent, vorzeichenbehaftet
  recurrence: Recurrence;
  interval: number;
  startDate: Date;
  endDate?: Date | null;
  categoryId?: string | null;
}

export interface ForecastOneOff {
  date: Date;
  amount: number; // Cent, vorzeichenbehaftet
  categoryId?: string | null;
}

export interface ScenarioConfig {
  inflowFactor: number; // globaler Faktor auf Zuflüsse (1 = unverändert)
  outflowFactor: number; // globaler Faktor auf Abflüsse
  inflowShiftDays: number; // Zuflüsse um n Tage nach hinten schieben
  // Kategoriespezifische Faktoren (categoryId -> Faktor), überschreiben global.
  categoryFactors?: Record<string, number>;
}

export const NEUTRAL_SCENARIO: ScenarioConfig = {
  inflowFactor: 1,
  outflowFactor: 1,
  inflowShiftDays: 0,
};

export interface ForecastInput {
  /** Gesamtsaldo aller Konten zum Stichtag "today" (Cent). */
  startBalanceCents: number;
  today: Date;
  horizonDays: number;
  plannedItems: ForecastPlannedItem[];
  /** Einmalige, datumsgenaue Zahlungen (z.B. offene Posten). */
  oneOffs?: ForecastOneOff[];
  /** Optionales Szenario; ohne Angabe neutral. */
  scenario?: ScenarioConfig;
}

export interface ForecastPoint {
  date: string; // ISO YYYY-MM-DD
  balance: number; // Cent, Saldo am Ende des Tages
  inflow: number; // Cent, Zuflüsse an diesem Tag
  outflow: number; // Cent, Abflüsse an diesem Tag (positiv dargestellt)
}

export interface ForecastResult {
  points: ForecastPoint[];
  lowest: ForecastPoint; // Tag mit dem niedrigsten Saldo
  totalInflow: number;
  totalOutflow: number;
  endBalance: number;
}

/**
 * Berechnet die tägliche Liquiditätsvorschau. Reine Funktion ohne DB-Zugriff,
 * damit sie leicht testbar ist.
 */
export function buildForecast(input: ForecastInput): ForecastResult {
  const today = startOfDayUTC(input.today);
  const horizon = Math.max(1, Math.floor(input.horizonDays));
  const end = addDays(today, horizon);
  const scenario = input.scenario ?? NEUTRAL_SCENARIO;

  // Tages-Buckets für Zu-/Abflüsse initialisieren.
  const inflowByDay = new Map<string, number>();
  const outflowByDay = new Map<string, number>();

  const catFactors = scenario.categoryFactors ?? {};

  // Verbucht eine Zahlung mit angewandtem Szenario in den passenden Tages-Bucket.
  const addEvent = (date: Date, amount: number, categoryId?: string | null) => {
    if (amount === 0) return;
    // Kategoriespezifischer Faktor überschreibt den globalen.
    const override =
      categoryId != null && catFactors[categoryId] !== undefined ? catFactors[categoryId] : undefined;
    let effectiveDate = date;
    let value = amount;
    if (amount >= 0) {
      const factor = override !== undefined ? override : scenario.inflowFactor;
      value = Math.round(amount * factor);
      if (scenario.inflowShiftDays) effectiveDate = addDays(date, scenario.inflowShiftDays);
    } else {
      const factor = override !== undefined ? override : scenario.outflowFactor;
      value = -Math.round(-amount * factor);
    }
    // Nur innerhalb des Vorschaufensters [today, end] berücksichtigen.
    if (effectiveDate.getTime() < today.getTime() || effectiveDate.getTime() > end.getTime()) {
      return;
    }
    const key = isoDate(effectiveDate);
    if (value >= 0) {
      inflowByDay.set(key, (inflowByDay.get(key) ?? 0) + value);
    } else {
      outflowByDay.set(key, (outflowByDay.get(key) ?? 0) + -value);
    }
  };

  for (const item of input.plannedItems) {
    for (const date of occurrencesBetween(item, today, end)) {
      addEvent(date, item.amount, item.categoryId);
    }
  }

  for (const oneOff of input.oneOffs ?? []) {
    // Überfällige, noch offene Posten am heutigen Tag ansetzen.
    const date = startOfDayUTC(oneOff.date);
    addEvent(date.getTime() < today.getTime() ? today : date, oneOff.amount, oneOff.categoryId);
  }

  const points: ForecastPoint[] = [];
  let balance = input.startBalanceCents;
  let totalInflow = 0;
  let totalOutflow = 0;
  let lowest: ForecastPoint | null = null;

  for (let i = 0; i <= horizon; i++) {
    const date = addDays(today, i);
    const key = isoDate(date);
    const inflow = inflowByDay.get(key) ?? 0;
    const outflow = outflowByDay.get(key) ?? 0;
    balance += inflow - outflow;
    totalInflow += inflow;
    totalOutflow += outflow;

    const point: ForecastPoint = { date: key, balance, inflow, outflow };
    points.push(point);
    if (!lowest || balance < lowest.balance) lowest = point;
  }

  return {
    points,
    lowest: lowest!,
    totalInflow,
    totalOutflow,
    endBalance: balance,
  };
}
