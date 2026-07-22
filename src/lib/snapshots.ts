import { prisma } from "./db";
import { getForecast, getTotalBalanceCents } from "./queries";
import { todayUTC } from "./dates";

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Legt (idempotent) einen Forecast-Snapshot für das Monatsende in `horizonDays`
 * Tagen an und trägt für fällige, vergangene Snapshots den Ist-Wert nach.
 */
export async function recordForecastSnapshot(horizonDays = 30): Promise<{ created: boolean; targetMonth: string }> {
  const today = todayUTC();
  const target = new Date(today);
  target.setUTCDate(target.getUTCDate() + horizonDays);
  const targetMonth = monthKey(target);

  const forecast = await getForecast(horizonDays);
  const projected = forecast.endBalance;

  const existing = await prisma.forecastSnapshot.findUnique({
    where: { targetMonth_horizonDays: { targetMonth, horizonDays } },
  });
  let created = false;
  if (!existing) {
    await prisma.forecastSnapshot.create({
      data: { targetMonth, horizonDays, projectedLiquidity: projected },
    });
    created = true;
  }

  // Ist-Werte für vergangene Zielmonate nachtragen.
  const actualNow = await getTotalBalanceCents();
  const curMonth = monthKey(today);
  await prisma.forecastSnapshot.updateMany({
    where: { targetMonth: { lte: curMonth }, actualLiquidity: null },
    data: { actualLiquidity: actualNow },
  });

  return { created, targetMonth };
}

export interface AccuracyRow {
  targetMonth: string;
  horizonDays: number;
  projected: number;
  actual: number | null;
  deviation: number | null; // actual - projected
  deviationPct: number | null;
}

export async function getForecastAccuracy(): Promise<AccuracyRow[]> {
  const rows = await prisma.forecastSnapshot.findMany({ orderBy: { targetMonth: "asc" } });
  return rows.map((r) => {
    const deviation = r.actualLiquidity != null ? r.actualLiquidity - r.projectedLiquidity : null;
    return {
      targetMonth: r.targetMonth,
      horizonDays: r.horizonDays,
      projected: r.projectedLiquidity,
      actual: r.actualLiquidity,
      deviation,
      deviationPct:
        deviation != null && r.projectedLiquidity !== 0
          ? Math.round((deviation / Math.abs(r.projectedLiquidity)) * 1000) / 10
          : null,
    };
  });
}
