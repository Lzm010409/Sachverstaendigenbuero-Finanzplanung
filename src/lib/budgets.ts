import { prisma } from "./db";
import { budgetAnnualCents, isBudgetActiveOn, type BudgetPeriod } from "./budget";
import { todayUTC } from "./dates";

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
