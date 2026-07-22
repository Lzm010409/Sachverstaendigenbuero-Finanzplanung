// Hilfsfunktionen für Kategorie-Budgets mit Rhythmus. Intern wird immer der
// Jahreswert (annualBudget, Cent) gespeichert; erfasst/angezeigt wird er im
// gewählten Rhythmus.

export type BudgetPeriod = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

export const BUDGET_PERIODS: { value: BudgetPeriod; label: string; short: string; perYear: number }[] = [
  { value: "WEEKLY", label: "pro Woche", short: "Woche", perYear: 52 },
  { value: "MONTHLY", label: "pro Monat", short: "Monat", perYear: 12 },
  { value: "QUARTERLY", label: "pro Quartal", short: "Quartal", perYear: 4 },
  { value: "YEARLY", label: "pro Jahr", short: "Jahr", perYear: 1 },
];

const BY_VALUE = new Map(BUDGET_PERIODS.map((p) => [p.value, p]));

export function periodsPerYear(p: BudgetPeriod): number {
  return BY_VALUE.get(p)?.perYear ?? 12;
}

export function periodShort(p: BudgetPeriod): string {
  return BY_VALUE.get(p)?.short ?? "Monat";
}

/** Betrag im Rhythmus -> Jahreswert (Cent). */
export function periodToAnnualCents(amountCents: number, p: BudgetPeriod): number {
  return Math.round(amountCents * periodsPerYear(p));
}

/** Jahreswert (Cent) -> Betrag im Rhythmus (Cent). */
export function annualToPeriodCents(annualCents: number, p: BudgetPeriod): number {
  return Math.round(annualCents / periodsPerYear(p));
}
