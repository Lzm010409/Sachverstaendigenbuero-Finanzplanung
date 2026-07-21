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
}

export interface ForecastInput {
  /** Gesamtsaldo aller Konten zum Stichtag "today" (Cent). */
  startBalanceCents: number;
  today: Date;
  horizonDays: number;
  plannedItems: ForecastPlannedItem[];
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

  // Tages-Buckets für Zu-/Abflüsse initialisieren.
  const inflowByDay = new Map<string, number>();
  const outflowByDay = new Map<string, number>();

  for (const item of input.plannedItems) {
    const occ = occurrencesBetween(item, today, end);
    for (const date of occ) {
      const key = isoDate(date);
      if (item.amount >= 0) {
        inflowByDay.set(key, (inflowByDay.get(key) ?? 0) + item.amount);
      } else {
        outflowByDay.set(key, (outflowByDay.get(key) ?? 0) + -item.amount);
      }
    }
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
