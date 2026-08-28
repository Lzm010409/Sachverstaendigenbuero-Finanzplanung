// Belastungstest der Rechen-Engines. Zwei Teile:
//  (1) Reine Funktion buildForecast unter Last (synthetische Großmengen) +
//      Invarianten-Prüfung (Saldo = Start + Zu - Ab, Tagesschritt-Kontinuität).
//  (2) Laufzeit der echten DB-gestützten Engines auf den aktuellen Daten.
// Läuft im Container per LOADTEST=true (Ausgabe über die Logs) oder lokal via
// `npm run loadtest`. Deterministisch (kein Math.random über festen Seed).

import { buildForecast, type ForecastPlannedItem, type ForecastOneOff } from "@/lib/forecast";
import { getForecast, getTotalBalanceCents } from "@/lib/queries";
import { getCashflowMatrix, getKpis, getCategoryBreakdown } from "@/lib/analytics";
import { getWeeklyForecast } from "@/lib/planning";

function ms(t0: number): string {
  return `${(Date.now() - t0).toFixed(0)} ms`;
}

// Einfacher deterministischer PRNG (mulberry32) – kein Math.random nötig.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function synthForecast(nPlanned: number, nOneOff: number) {
  const rnd = rng(12345);
  const today = new Date(Date.UTC(2026, 0, 1));
  const planned: ForecastPlannedItem[] = [];
  const recs = ["MONTHLY", "WEEKLY", "QUARTERLY", "YEARLY", "ONCE"] as const;
  for (let i = 0; i < nPlanned; i++) {
    planned.push({
      amount: Math.round((rnd() - 0.5) * 500000),
      recurrence: recs[Math.floor(rnd() * recs.length)],
      interval: 1,
      startDate: new Date(today.getTime() + Math.floor(rnd() * 30) * 86400000),
      endDate: null,
      categoryId: null,
    });
  }
  const oneOffs: ForecastOneOff[] = [];
  for (let i = 0; i < nOneOff; i++) {
    oneOffs.push({
      date: new Date(today.getTime() + Math.floor(rnd() * 700) * 86400000),
      amount: Math.round((rnd() - 0.5) * 300000),
      categoryId: null,
    });
  }
  return { today, planned, oneOffs };
}

async function main() {
  console.log("[loadtest] === Teil 1: buildForecast unter Last (rein) ===");
  for (const [np, no] of [[2000, 20000], [10000, 100000]] as const) {
    const { today, planned, oneOffs } = synthForecast(np, no);
    const t0 = Date.now();
    const f = buildForecast({ startBalanceCents: 5_000_000, today, horizonDays: 730, plannedItems: planned, oneOffs });
    const dur = ms(t0);

    // Invariante 1: Endsaldo = Start + Zuflüsse - Abflüsse.
    const start = f.points[0].balance - f.points[0].inflow + f.points[0].outflow;
    const reconOk = Math.abs(start + f.totalInflow - f.totalOutflow - f.endBalance) <= 1;
    // Invariante 2: jeder Tag = Vortag + Zufluss - Abfluss.
    let stepErr = 0;
    for (let i = 1; i < f.points.length; i++) {
      if (Math.abs(f.points[i - 1].balance + f.points[i].inflow - f.points[i].outflow - f.points[i].balance) > 1) stepErr++;
    }
    console.log(`[loadtest] ${np} Planposten + ${no} Einmalposten -> ${f.points.length} Tage in ${dur} | Rekonziliation=${reconOk ? "OK" : "FEHLER"} | Tagesfehler=${stepErr}`);
  }

  console.log("[loadtest] === Teil 2: echte Engines auf aktuellen Daten ===");
  const timings: [string, number, string][] = [];
  const time = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    const r = await fn();
    timings.push([name, Date.now() - t0, ""]);
    return r;
  };
  await time("getTotalBalanceCents", () => getTotalBalanceCents());
  await time("getForecast(90)", () => getForecast(90));
  await time("getForecast(365)", () => getForecast(365));
  await time("getCashflowMatrix(6,6)", () => getCashflowMatrix(6, 6));
  await time("getKpis", () => getKpis());
  await time("getWeeklyForecast(13)", () => getWeeklyForecast(13, undefined, 0));
  await time("getCategoryBreakdown(month)", () => getCategoryBreakdown("month"));
  for (const [name, dur] of timings) {
    console.log(`[loadtest]   ${name}: ${dur} ms`);
  }
  const slow = timings.filter(([, d]) => d > 2000);
  console.log(`[loadtest] Engines gesamt: ${timings.reduce((s, [, d]) => s + d, 0)} ms · ${slow.length} langsam (>2s)`);
  console.log("[loadtest] fertig.");
}

main().catch((e) => console.log("[loadtest] Fehler:", (e as Error).message)).finally(() => process.exit(0));
