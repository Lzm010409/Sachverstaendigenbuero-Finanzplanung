import { getSettings } from "./settings";
import { getForecast } from "./queries";
import { addDays, isoDate, todayUTC } from "./dates";
import type { ForecastResult } from "./forecast";

export interface PlanningSettings {
  minLiquidityCents: number;
  vatRatePercent: number;
  vatCycle: "monthly" | "quarterly";
  notifyEmail: string | null;
}

export async function getPlanningSettings(): Promise<PlanningSettings> {
  const s = await getSettings(["liquidity.minThreshold", "tax.vatRate", "tax.vatCycle", "notify.email"]);
  return {
    minLiquidityCents: Number(s["liquidity.minThreshold"] ?? 0) || 0,
    vatRatePercent: s["tax.vatRate"] != null ? Number(s["tax.vatRate"]) : 19,
    vatCycle: s["tax.vatCycle"] === "monthly" ? "monthly" : "quarterly",
    notifyEmail: s["notify.email"] || null,
  };
}

export interface ThresholdBreach {
  date: string; // ISO
  balance: number; // Cent am Tag der Unterschreitung
  threshold: number;
  daysAway: number;
}

/** Erster Tag, an dem die prognostizierte Liquidität die Schwelle unterschreitet. */
export function findThresholdBreach(forecast: ForecastResult, thresholdCents: number): ThresholdBreach | null {
  if (thresholdCents <= 0) return null;
  const today = todayUTC();
  for (const p of forecast.points) {
    if (p.balance < thresholdCents) {
      const d = new Date(p.date + "T00:00:00Z");
      const daysAway = Math.round((d.getTime() - today.getTime()) / 86_400_000);
      return { date: p.date, balance: p.balance, threshold: thresholdCents, daysAway };
    }
  }
  return null;
}

export interface WeekBucket {
  index: number;
  startISO: string;
  endISO: string; // inklusiv (Sonntag)
  label: string; // "KW 30 · 21.07."
  startLiquidity: number;
  inflow: number;
  outflow: number; // positiv
  net: number;
  endLiquidity: number;
  belowThreshold: boolean;
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7; // Mo=0
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diff = (date.getTime() - firstThursday.getTime()) / 86_400_000;
  return 1 + Math.round((diff - ((firstThursday.getUTCDay() + 6) % 7) + 3) / 7);
}

/**
 * Aggregiert die tägliche Vorschau in n Wochen-Buckets (rollierend ab heute,
 * Wochenstart Montag). Standard 13 Wochen = klassischer Treasury-Plan.
 */
export async function getWeeklyForecast(
  weeks = 13,
  scenarioId?: string,
  thresholdCents = 0,
): Promise<{ startBalance: number; weeks: WeekBucket[] }> {
  const days = weeks * 7 + 7;
  const forecast = await getForecast(days, scenarioId);
  const today = todayUTC();
  // Auf Montag der aktuellen Woche zurückgehen.
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  const firstMonday = addDays(today, -mondayOffset);

  const byDate = new Map(forecast.points.map((p) => [p.date, p]));
  const startBalance = forecast.points[0]?.balance ?? 0;

  const buckets: WeekBucket[] = [];
  for (let w = 0; w < weeks; w++) {
    const start = addDays(firstMonday, w * 7);
    const end = addDays(start, 6);
    let inflow = 0;
    let outflow = 0;
    for (let i = 0; i < 7; i++) {
      const p = byDate.get(isoDate(addDays(start, i)));
      if (p) {
        inflow += p.inflow;
        outflow += p.outflow;
      }
    }
    // Start-/End-Liquidität aus den Tagespunkten (Saldo am letzten Tag der Woche).
    const endPoint = byDate.get(isoDate(end)) ?? byDate.get(isoDate(addDays(start, 6)));
    const prevEnd = buckets.length ? buckets[buckets.length - 1].endLiquidity : startBalance;
    const endLiquidity = endPoint ? endPoint.balance : prevEnd + inflow - outflow;
    buckets.push({
      index: w,
      startISO: isoDate(start),
      endISO: isoDate(end),
      label: `KW ${isoWeek(start)} · ${start.getUTCDate()}.${start.getUTCMonth() + 1}.`,
      startLiquidity: prevEnd,
      inflow,
      outflow,
      net: inflow - outflow,
      endLiquidity,
      belowThreshold: thresholdCents > 0 && endLiquidity < thresholdCents,
    });
  }
  return { startBalance, weeks: buckets };
}
