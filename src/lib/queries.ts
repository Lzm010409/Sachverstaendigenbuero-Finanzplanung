import { cache } from "react";
import { prisma } from "./db";
import type { CatNode } from "./category-tree";
import {
  buildForecast,
  type ForecastOneOff,
  type ForecastResult,
  type ScenarioConfig,
} from "./forecast";
import { addMonths, startOfDayUTC, todayUTC } from "./dates";
import { getForecastBudgetItems } from "./budgets";
import { budgetAnnualCents, type BudgetPeriod } from "./budget";

/**
 * Aktueller Gesamtsaldo (Cent) = Summe der Anfangssalden aller aktiven Konten
 * plus Summe aller gebuchten Umsätze.
 * Konvention: Anfangssaldo = Kontostand zum openingDate; danach werden alle
 * importierten Umsätze aufaddiert.
 */
export const getTotalBalanceCents = cache(async (): Promise<number> => {
  const accounts = await getAccountsWithBalance();
  return accounts.filter((a) => !a.excludedFromCalc).reduce((s, a) => s + a.currentBalance, 0);
});

// Where-Fragment für Transaktionen, die in Berechnungen einfließen sollen
// (nur nicht-archivierte, nicht-ausgeschlossene Konten).
export const INCLUDED_ACCOUNT = { archived: false, excludedFromCalc: false } as const;

// IDs der neutralen Transfer-Kategorien (Geldtransfer). Umsätze dieser Kategorien
// zählen NICHT als Ein-/Ausgabe (Konto-zu-Konto, netto null), bleiben aber im
// Kontostand. Wird von Kennzahlen/Cashflow/Auswertung genutzt.
export const getTransferCategoryIds = cache(async (): Promise<Set<string>> => {
  const cats = await prisma.category.findMany({ where: { isTransfer: true }, select: { id: true } });
  return new Set(cats.map((c) => c.id));
});

export interface AccountWithBalance {
  id: string;
  name: string;
  type: string;
  iban: string | null;
  openingBalance: number;
  openingDate: Date;
  currentBalance: number;
  txCount: number;
  excludedFromCalc: boolean;
}

export const getAccountsWithBalance = cache(async (): Promise<AccountWithBalance[]> => {
  const accounts = await prisma.account.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { transactions: true } } },
  });
  // Bewegung je Konto per DB-Aggregat (nur Umsätze ab dem Stichtag) – statt
  // alle Transaktionen in den Speicher zu laden. Nutzt den Index [accountId,
  // bookingDate].
  const sums = await Promise.all(
    accounts.map((a) =>
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { accountId: a.id, bookingDate: { gte: a.openingDate } },
      }),
    ),
  );
  return accounts.map((a, i) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    iban: a.iban,
    openingBalance: a.openingBalance,
    openingDate: a.openingDate,
    currentBalance: a.openingBalance + (sums[i]._sum.amount ?? 0),
    txCount: a._count.transactions,
    excludedFromCalc: a.excludedFromCalc,
  }));
});

/** Offene (unbezahlte) Posten als datumsgenaue Einmal-Zahlungen für den Forecast. */
export async function getOpenItemOneOffs(): Promise<ForecastOneOff[]> {
  const items = await prisma.openItem.findMany({ where: { paid: false } });
  const out: ForecastOneOff[] = [];
  for (const i of items) {
    const open = i.amount - i.paidAmount; // nur der offene Restbetrag zählt
    if (open <= 0) continue;
    out.push({
      date: i.dueDate,
      amount: i.kind === "RECEIVABLE" ? open : -open,
      categoryId: i.categoryId,
    });
  }
  return out;
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
export const getForecast = cache(async (horizonDays = 90, scenarioId?: string): Promise<ForecastResult> => {
  const [startBalance, plannedRaw, oneOffsRaw, scenario, budgetItemsRaw, transferIds] = await Promise.all([
    getTotalBalanceCents(),
    prisma.plannedItem.findMany({ where: { active: true } }),
    getOpenItemOneOffs(),
    getScenarioConfig(scenarioId),
    getForecastBudgetItems(),
    getTransferCategoryIds(),
  ]);

  // Geldtransfers sind netto null über alle einbezogenen Konten und dürfen die
  // Gesamt-Liquiditätsvorschau NICHT verändern (konsistent mit getCashflowMatrix).
  const notTransfer = (categoryId: string | null | undefined) => !(categoryId && transferIds.has(categoryId));
  const planned = plannedRaw.filter((p) => notTransfer(p.categoryId));
  const oneOffs = oneOffsRaw.filter((o) => notTransfer(o.categoryId));
  const budgetItems = budgetItemsRaw.filter((b) => notTransfer(b.categoryId));

  return buildForecast({
    startBalanceCents: startBalance,
    today: todayUTC(),
    horizonDays,
    oneOffs,
    scenario,
    plannedItems: [
      ...planned.map((p) => ({
        id: p.id,
        name: p.name,
        amount: p.amount,
        recurrence: p.recurrence,
        interval: p.interval,
        startDate: p.startDate,
        endDate: p.endDate,
        categoryId: p.categoryId,
      })),
      // Budgets mit „In Prognose einplanen" als zusätzliche Planposten.
      ...budgetItems,
    ],
  });
});

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
  /** Kategorien inkl. Überkategorie-Zuordnung – für die gruppierte Anzeige. */
  categories: CatNode[];
}> {
  const today = todayUTC();
  const monthStart = startOfDayUTC(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1)),
  );
  const monthEnd = addMonths(monthStart, 1);

  const [categories, planned, budgets, txs] = await Promise.all([
    prisma.category.findMany({ where: { deletedAt: null } }),
    prisma.plannedItem.findMany({ where: { active: true } }),
    prisma.budget.findMany({
      where: { deletedAt: null, active: true, categoryId: { not: null } },
      select: { categoryId: true, kind: true, amount: true, period: true, startDate: true, endDate: true },
    }),
    prisma.transaction.findMany({
      where: { bookingDate: { gte: monthStart, lt: monthEnd }, account: INCLUDED_ACCOUNT },
    }),
  ]);

  const { occurrencesBetween } = await import("./recurrence");
  const lastOfMonth = addMonths(monthStart, 1);
  lastOfMonth.setUTCDate(0); // letzter Tag des Monats

  // Plan je Kategorie = Budget hat VORRANG (das „Soll"); nur wo KEIN Budget
  // existiert, greift der Planposten. So gibt es je Kategorie genau eine
  // Plan-Quelle – keine Doppelzählung, trotzdem vollständig.

  // Planposten mit Kategorie (im Monat fällig).
  const plannedItemByCat = new Map<string, number>();
  for (const p of planned) {
    const occ = occurrencesBetween(p, monthStart, lastOfMonth);
    if (occ.length === 0) continue;
    const key = p.categoryId ?? "__none__";
    plannedItemByCat.set(key, (plannedItemByCat.get(key) ?? 0) + p.amount * occ.length);
  }
  // Budgets (Monatsbetrag = Jahreswert/12, wie auf der Übersicht), sofern der
  // Gültigkeitszeitraum diesen Monat überschneidet. Vorzeichen aus der Art.
  const budgetByCat = new Map<string, number>();
  for (const b of budgets) {
    const startsBeforeEnd = !b.startDate || new Date(b.startDate).getTime() < monthEnd.getTime();
    const endsAfterStart = !b.endDate || new Date(b.endDate).getTime() >= monthStart.getTime();
    if (!startsBeforeEnd || !endsAfterStart) continue;
    const monthly = Math.round(budgetAnnualCents(b.amount, b.period as BudgetPeriod) / 12);
    const signed = b.kind === "EXPENSE" ? -Math.abs(monthly) : Math.abs(monthly);
    budgetByCat.set(b.categoryId!, (budgetByCat.get(b.categoryId!) ?? 0) + signed);
  }
  // Zusammenführen: Budget gewinnt, sonst Planposten.
  const plannedByCat = new Map<string, number>();
  for (const key of new Set([...budgetByCat.keys(), ...plannedItemByCat.keys()])) {
    plannedByCat.set(key, budgetByCat.has(key) ? budgetByCat.get(key)! : plannedItemByCat.get(key)!);
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
  return {
    monthStart,
    rows,
    categories: categories.map((c) => ({
      id: c.id, name: c.name, kind: c.kind, color: c.color, parentId: c.parentId, isGroup: c.isGroup,
    })),
  };
}
