import { prisma } from "./db";
import {
  buildForecast,
  type ForecastOneOff,
  type ForecastResult,
  type ScenarioConfig,
} from "./forecast";
import { addMonths, startOfDayUTC, todayUTC } from "./dates";

/**
 * Aktueller Gesamtsaldo (Cent) = Summe der Anfangssalden aller aktiven Konten
 * plus Summe aller gebuchten Umsätze.
 * Konvention: Anfangssaldo = Kontostand zum openingDate; danach werden alle
 * importierten Umsätze aufaddiert.
 */
export async function getTotalBalanceCents(): Promise<number> {
  const [accounts, txAgg] = await Promise.all([
    prisma.account.aggregate({
      _sum: { openingBalance: true },
      where: { archived: false },
    }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { account: { archived: false } },
    }),
  ]);
  return (accounts._sum.openingBalance ?? 0) + (txAgg._sum.amount ?? 0);
}

export interface AccountWithBalance {
  id: string;
  name: string;
  type: string;
  iban: string | null;
  openingBalance: number;
  currentBalance: number;
  txCount: number;
}

export async function getAccountsWithBalance(): Promise<AccountWithBalance[]> {
  const accounts = await prisma.account.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { transactions: true } },
      transactions: { select: { amount: true } },
    },
  });
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    iban: a.iban,
    openingBalance: a.openingBalance,
    currentBalance: a.openingBalance + a.transactions.reduce((s, t) => s + t.amount, 0),
    txCount: a._count.transactions,
  }));
}

/** Offene (unbezahlte) Posten als datumsgenaue Einmal-Zahlungen für den Forecast. */
export async function getOpenItemOneOffs(): Promise<ForecastOneOff[]> {
  const items = await prisma.openItem.findMany({ where: { paid: false } });
  return items.map((i) => ({
    date: i.dueDate,
    amount: i.kind === "RECEIVABLE" ? i.amount : -i.amount,
    categoryId: i.categoryId,
  }));
}

/** Lädt die Szenario-Konfiguration (inkl. kategoriespezifischer Faktoren) oder undefined. */
export async function getScenarioConfig(scenarioId?: string): Promise<ScenarioConfig | undefined> {
  if (!scenarioId) return undefined;
  const s = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: { categoryAdjustments: true },
  });
  if (!s) return undefined;
  return {
    inflowFactor: s.inflowFactor,
    outflowFactor: s.outflowFactor,
    inflowShiftDays: s.inflowShiftDays,
    categoryFactors: Object.fromEntries(
      s.categoryAdjustments.map((a) => [a.categoryId, a.factor]),
    ),
  };
}

/** Baut die Liquiditätsvorschau über einen Horizont (Tage) aus den DB-Daten. */
export async function getForecast(horizonDays = 90, scenarioId?: string): Promise<ForecastResult> {
  const [startBalance, planned, oneOffs, scenario] = await Promise.all([
    getTotalBalanceCents(),
    prisma.plannedItem.findMany({ where: { active: true } }),
    getOpenItemOneOffs(),
    getScenarioConfig(scenarioId),
  ]);

  return buildForecast({
    startBalanceCents: startBalance,
    today: todayUTC(),
    horizonDays,
    oneOffs,
    scenario,
    plannedItems: planned.map((p) => ({
      id: p.id,
      name: p.name,
      amount: p.amount,
      recurrence: p.recurrence,
      interval: p.interval,
      startDate: p.startDate,
      endDate: p.endDate,
      categoryId: p.categoryId,
    })),
  });
}

export interface PlanActualRow {
  categoryId: string | null;
  categoryName: string;
  kind: "INCOME" | "EXPENSE" | "MIXED";
  planned: number; // Cent, vorzeichenbehaftet
  actual: number; // Cent, vorzeichenbehaftet
}

/**
 * Plan/Ist-Vergleich für einen Kalendermonat: geplante gegen tatsächlich
 * gebuchte Beträge je Kategorie. monthOffset 0 = aktueller Monat, -1 = Vormonat.
 */
export async function getPlanVsActual(monthOffset = 0): Promise<{
  monthStart: Date;
  rows: PlanActualRow[];
}> {
  const today = todayUTC();
  const monthStart = startOfDayUTC(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1)),
  );
  const monthEnd = addMonths(monthStart, 1);

  const [categories, planned, txs] = await Promise.all([
    prisma.category.findMany(),
    prisma.plannedItem.findMany({ where: { active: true } }),
    prisma.transaction.findMany({
      where: { bookingDate: { gte: monthStart, lt: monthEnd } },
    }),
  ]);

  const { occurrencesBetween } = await import("./recurrence");
  const lastOfMonth = addMonths(monthStart, 1);
  lastOfMonth.setUTCDate(0); // letzter Tag des Monats

  const plannedByCat = new Map<string, number>();
  for (const p of planned) {
    const occ = occurrencesBetween(p, monthStart, lastOfMonth);
    if (occ.length === 0) continue;
    const key = p.categoryId ?? "__none__";
    plannedByCat.set(key, (plannedByCat.get(key) ?? 0) + p.amount * occ.length);
  }

  const actualByCat = new Map<string, number>();
  for (const t of txs) {
    const key = t.categoryId ?? "__none__";
    actualByCat.set(key, (actualByCat.get(key) ?? 0) + t.amount);
  }

  const catInfo = new Map(categories.map((c) => [c.id, c]));
  const keys = new Set<string>([...plannedByCat.keys(), ...actualByCat.keys()]);
  const rows: PlanActualRow[] = [];
  for (const key of keys) {
    const cat = key === "__none__" ? null : catInfo.get(key);
    rows.push({
      categoryId: cat?.id ?? null,
      categoryName: cat?.name ?? "Ohne Kategorie",
      kind: cat?.kind ?? "MIXED",
      planned: plannedByCat.get(key) ?? 0,
      actual: actualByCat.get(key) ?? 0,
    });
  }
  rows.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  return { monthStart, rows };
}
