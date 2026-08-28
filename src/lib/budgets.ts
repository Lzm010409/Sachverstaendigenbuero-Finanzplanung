import { prisma } from "./db";
import { budgetAnnualCents, isBudgetActiveOn, type BudgetPeriod } from "./budget";
import { todayUTC } from "./dates";
import type { Recurrence } from "./recurrence";

// BudgetPeriod → Recurrence (gleicher Schritt, Intervall 1).
const PERIOD_TO_RECURRENCE: Record<BudgetPeriod, Recurrence> = {
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  YEARLY: "YEARLY",
};

export interface BudgetForecastItem {
  id: string;
  name: string;
  amount: number; // Cent, vorzeichenbehaftet (Ausgabe negativ)
  recurrence: Recurrence;
  interval: number;
  startDate: Date;
  endDate: Date | null;
  categoryId: string | null;
}

/**
 * Budgets, die als wiederkehrende Planposten in die Prognose einfließen sollen
 * (includeInForecast). Betrag im Rhythmus, Vorzeichen aus der Art, begrenzt auf
 * den optionalen Gültigkeitszeitraum (startDate..endDate). Ohne startDate ab
 * heute. Wird von getForecast UND getCashflowMatrix genutzt, damit alle
 * Prognose-Ansichten konsistent sind.
 */
export async function getForecastBudgetItems(
  ref: Date = todayUTC(),
): Promise<BudgetForecastItem[]> {
  const budgets = await prisma.budget.findMany({
    where: { deletedAt: null, active: true, includeInForecast: true },
    select: { id: true, title: true, kind: true, amount: true, period: true, startDate: true, endDate: true, categoryId: true },
  });
  return budgets.map((b) => ({
    id: `budget:${b.id}`,
    name: b.title,
    amount: b.kind === "EXPENSE" ? -Math.abs(b.amount) : Math.abs(b.amount),
    recurrence: PERIOD_TO_RECURRENCE[b.period as BudgetPeriod],
    interval: 1,
    // Ab Gültig-ab, mindestens ab heute (keine vergangenen Planposten erzeugen).
    startDate: b.startDate && new Date(b.startDate).getTime() > ref.getTime() ? new Date(b.startDate) : ref,
    endDate: b.endDate ? new Date(b.endDate) : null,
    categoryId: b.categoryId,
  }));
}

/**
 * Jahresbudget je Kategorie (Cent) aus den entkoppelten Budget-Objekten.
 * Summiert alle aktiven, nicht gelöschten und am Stichtag gültigen Budgets, die
 * einer Kategorie zugeordnet sind. Mehrere Budgets je Kategorie werden addiert.
 */
export async function getBudgetAnnualByCategory(
  ref: Date = todayUTC(),
): Promise<Map<string, number>> {
  const budgets = await prisma.budget.findMany({
    where: { deletedAt: null, active: true, categoryId: { not: null } },
    select: { categoryId: true, amount: true, period: true, startDate: true, endDate: true },
  });
  const map = new Map<string, number>();
  for (const b of budgets) {
    if (!isBudgetActiveOn(b, ref)) continue;
    const annual = budgetAnnualCents(b.amount, b.period as BudgetPeriod);
    map.set(b.categoryId!, (map.get(b.categoryId!) ?? 0) + annual);
  }
  return map;
}
