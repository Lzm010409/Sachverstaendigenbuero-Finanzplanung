import { getSettings } from "./settings";
import { getForecast, getTotalBalanceCents, INCLUDED_ACCOUNT } from "./queries";
import { prisma } from "./db";
import { addDays, isoDate, todayUTC } from "./dates";
import type { ForecastResult } from "./forecast";

export interface PlanningSettings {
  minLiquidityCents: number;
  vatRatePercent: number;
  vatCycle: "monthly" | "quarterly";
  vatBasis: "soll" | "ist"; // Soll- (nach Rechnungsdatum) oder Ist-Versteuerung (nach Zahldatum)
  notifyEmail: string | null;
}

export async function getPlanningSettings(): Promise<PlanningSettings> {
  const s = await getSettings(["liquidity.minThreshold", "tax.vatRate", "tax.vatCycle", "tax.vatBasis", "notify.email"]);
  return {
    minLiquidityCents: Number(s["liquidity.minThreshold"] ?? 0) || 0,
    vatRatePercent: s["tax.vatRate"] != null ? Number(s["tax.vatRate"]) : 19,
    // Standard: monatliche USt-Voranmeldung.
    vatCycle: s["tax.vatCycle"] === "quarterly" ? "quarterly" : "monthly",
    // Standard: Soll-Versteuerung (nach Rechnungs-/Belegdatum).
    vatBasis: s["tax.vatBasis"] === "ist" ? "ist" : "soll",
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
  inflowRealized: number;
  inflowPlanned: number;
  outflowRealized: number; // positiv
  outflowPlanned: number; // positiv
  overdueInflow: number; // Anteil aus überfälligen Forderungen (in inflowPlanned enthalten)
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
  const today = todayUTC();
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  const firstMonday = addDays(today, -mondayOffset);

  const [forecast, currentBalance, weekTxs, overdueItems] = await Promise.all([
    getForecast(days, scenarioId),
    getTotalBalanceCents(),
    // Bereits gebuchte Umsätze der laufenden Woche (Montag bis heute) = realisiert.
    prisma.transaction.findMany({
      where: { bookingDate: { gte: firstMonday, lte: today }, account: INCLUDED_ACCOUNT },
      select: { amount: true },
    }),
    // Überfällige offene Forderungen (werden von der Engine auf "heute" gezogen).
    prisma.openItem.findMany({
      where: { paid: false, kind: "RECEIVABLE", dueDate: { lt: today } },
      select: { amount: true, paidAmount: true },
    }),
  ]);

  const byDate = new Map(forecast.points.map((p) => [p.date, p]));

  // Realisiert in der laufenden Woche (bereits im currentBalance enthalten).
  let realizedIn = 0;
  let realizedOut = 0;
  for (const t of weekTxs) {
    if (t.amount >= 0) realizedIn += t.amount;
    else realizedOut += -t.amount;
  }
  const overdueInflowTotal = overdueItems.reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount), 0);

  // Der Walk beginnt am Wochenanfang: currentBalance abzüglich der bereits in
  // dieser Woche gebuchten (realisierten) Netto-Bewegung.
  let running = currentBalance - (realizedIn - realizedOut);

  const buckets: WeekBucket[] = [];
  for (let w = 0; w < weeks; w++) {
    const start = addDays(firstMonday, w * 7);
    // Geplante (zukünftige) Bewegungen dieser Woche aus der Forecast-Engine.
    let plannedIn = 0;
    let plannedOut = 0;
    for (let i = 0; i < 7; i++) {
      const p = byDate.get(isoDate(addDays(start, i)));
      if (p) {
        plannedIn += p.inflow;
        plannedOut += p.outflow;
      }
    }
    // Realisierte Bewegungen nur in der laufenden Woche (w === 0).
    const rIn = w === 0 ? realizedIn : 0;
    const rOut = w === 0 ? realizedOut : 0;
    const inflow = rIn + plannedIn;
    const outflow = rOut + plannedOut;
    const net = inflow - outflow;
    const startLiquidity = running;
    const endLiquidity = startLiquidity + net; // Invariante: Start + Netto = Ende
    running = endLiquidity;
    buckets.push({
      index: w,
      startISO: isoDate(start),
      endISO: isoDate(addDays(start, 6)),
      label: `KW ${isoWeek(start)} · ${start.getUTCDate()}.${start.getUTCMonth() + 1}.`,
      startLiquidity,
      inflow,
      outflow,
      inflowRealized: rIn,
      inflowPlanned: plannedIn,
      outflowRealized: rOut,
      outflowPlanned: plannedOut,
      overdueInflow: w === 0 ? overdueInflowTotal : 0,
      net,
      endLiquidity,
      belowThreshold: thresholdCents > 0 && endLiquidity < thresholdCents,
    });
  }
  return { startBalance: currentBalance, weeks: buckets };
}
