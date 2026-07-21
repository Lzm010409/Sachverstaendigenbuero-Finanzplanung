import { prisma } from "./db";
import { addDays, addMonths, startOfDayUTC, todayUTC } from "./dates";
import { getTotalBalanceCents, INCLUDED_ACCOUNT } from "./queries";

export type Granularity = "week" | "month" | "year";

export interface Period {
  key: string;
  label: string;
  start: Date;
  end: Date; // exklusiv
}

function mondayOfWeek(d: Date): Date {
  const base = startOfDayUTC(d);
  const dow = base.getUTCDay(); // 0=So..6=Sa
  const diff = (dow + 6) % 7; // Tage seit Montag
  return addDays(base, -diff);
}

function isoWeek(d: Date): number {
  const date = startOfDayUTC(d);
  // ISO-8601 Wochennummer
  const day = (date.getUTCDay() + 6) % 7;
  const thursday = addDays(date, 3 - day);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  const week1Monday = addDays(firstThursday, -firstDay);
  return Math.floor((thursday.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1;
}

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** Erzeugt die Spalten-Zeiträume je nach Granularität. */
export function buildPeriods(granularity: Granularity, ref: Date = todayUTC()): Period[] {
  const periods: Period[] = [];
  if (granularity === "month") {
    const year = ref.getUTCFullYear();
    for (let m = 0; m < 12; m++) {
      const start = new Date(Date.UTC(year, m, 1));
      periods.push({ key: `${year}-${m + 1}`, label: MONTHS[m], start, end: addMonths(start, 1) });
    }
  } else if (granularity === "week") {
    const thisMonday = mondayOfWeek(ref);
    for (let i = 11; i >= 0; i--) {
      const start = addDays(thisMonday, -7 * i);
      periods.push({ key: `w-${start.toISOString().slice(0, 10)}`, label: `KW${isoWeek(start)}`, start, end: addDays(start, 7) });
    }
  } else {
    const year = ref.getUTCFullYear();
    for (let y = year - 3; y <= year; y++) {
      const start = new Date(Date.UTC(y, 0, 1));
      periods.push({ key: `y-${y}`, label: String(y), start, end: new Date(Date.UTC(y + 1, 0, 1)) });
    }
  }
  return periods;
}

export interface BreakdownRow {
  categoryId: string | null;
  name: string;
  kind: "INCOME" | "EXPENSE" | "MIXED";
  color: string;
  annualBudget: number; // Cent
  values: number[]; // signierte Summe je Periode (Cent)
  yearActual: number; // Betrag (Magnitude) laufendes Kalenderjahr (Cent)
  budgetPct: number | null; // Anteil Jahresbudget verbraucht (0..>1), null wenn kein Budget
}

export interface BreakdownResult {
  granularity: Granularity;
  periods: Period[];
  periodBudgetDivisor: number; // 12 (Monat), 52 (Woche), 1 (Jahr)
  incomeRows: BreakdownRow[];
  expenseRows: BreakdownRow[];
}

/**
 * Tabellarische Kategorien-Auswertung: Summen je Kategorie und Periode,
 * plus Verbrauch gegen das Jahresbudget.
 */
export async function getCategoryBreakdown(
  granularity: Granularity = "month",
): Promise<BreakdownResult> {
  const today = todayUTC();
  const periods = buildPeriods(granularity, today);
  const rangeStart = periods[0].start;
  const rangeEnd = periods[periods.length - 1].end;
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const yearEnd = new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1));

  const [categories, txs, yearTxs] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    prisma.transaction.findMany({
      where: { bookingDate: { gte: rangeStart, lt: rangeEnd }, account: INCLUDED_ACCOUNT },
      select: { categoryId: true, amount: true, bookingDate: true },
    }),
    prisma.transaction.findMany({
      where: { bookingDate: { gte: yearStart, lt: yearEnd }, account: INCLUDED_ACCOUNT },
      select: { categoryId: true, amount: true },
    }),
  ]);

  const divisor = granularity === "month" ? 12 : granularity === "week" ? 52 : 1;

  // Summen je Kategorie × Periode
  const key = (id: string | null) => id ?? "__none__";
  const periodSums = new Map<string, number[]>();
  const initRow = (k: string) => {
    if (!periodSums.has(k)) periodSums.set(k, new Array(periods.length).fill(0));
    return periodSums.get(k)!;
  };
  for (const t of txs) {
    const idx = periods.findIndex(
      (p) => t.bookingDate.getTime() >= p.start.getTime() && t.bookingDate.getTime() < p.end.getTime(),
    );
    if (idx < 0) continue;
    initRow(key(t.categoryId))[idx] += t.amount;
  }
  const yearSums = new Map<string, number>();
  for (const t of yearTxs) {
    yearSums.set(key(t.categoryId), (yearSums.get(key(t.categoryId)) ?? 0) + t.amount);
  }

  const catInfo = new Map(categories.map((c) => [c.id, c]));
  const buildRow = (k: string): BreakdownRow => {
    const cat = k === "__none__" ? null : catInfo.get(k);
    const yearActual = Math.abs(yearSums.get(k) ?? 0);
    const annualBudget = cat?.annualBudget ?? 0;
    return {
      categoryId: cat?.id ?? null,
      name: cat?.name ?? "Ohne Kategorie",
      kind: cat?.kind ?? "MIXED",
      color: cat?.color ?? "#94a3b8",
      annualBudget,
      values: periodSums.get(k) ?? new Array(periods.length).fill(0),
      yearActual,
      budgetPct: annualBudget > 0 ? yearActual / annualBudget : null,
    };
  };

  const allKeys = new Set<string>([
    ...categories.map((c) => c.id),
    ...periodSums.keys(),
    ...yearSums.keys(),
  ]);
  const rows = [...allKeys].map(buildRow).filter((r) => {
    // Zeilen ohne jegliche Bewegung und ohne Budget ausblenden
    const hasData = r.values.some((v) => v !== 0) || r.yearActual !== 0 || r.annualBudget > 0;
    return hasData;
  });

  return {
    granularity,
    periods,
    periodBudgetDivisor: divisor,
    incomeRows: rows.filter((r) => r.kind === "INCOME").sort((a, b) => a.name.localeCompare(b.name)),
    expenseRows: rows
      .filter((r) => r.kind !== "INCOME")
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export interface Kpis {
  currentBalance: number;
  avgMonthlyIncome: number;
  avgMonthlyExpense: number;
  netMonthly: number; // + = Überschuss, - = Verbrennung
  runwayMonths: number | null; // Monate bis 0 bei aktuellem Netto-Burn, null wenn kein Burn
  openReceivables: number;
  openPayables: number;
  workingCapital: number; // Saldo + Forderungen - Verbindlichkeiten
}

/** Kennzahlen auf Basis der letzten 3 Monate + offene Posten. */
export async function getKpis(): Promise<Kpis> {
  const today = todayUTC();
  const from = addMonths(today, -3);

  const [balance, txs, openItems] = await Promise.all([
    getTotalBalanceCents(),
    prisma.transaction.findMany({
      where: { bookingDate: { gte: from, lt: today }, account: INCLUDED_ACCOUNT },
      select: { amount: true },
    }),
    prisma.openItem.findMany({ where: { paid: false }, select: { kind: true, amount: true } }),
  ]);

  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.amount >= 0) income += t.amount;
    else expense += -t.amount;
  }
  const avgMonthlyIncome = Math.round(income / 3);
  const avgMonthlyExpense = Math.round(expense / 3);
  const netMonthly = avgMonthlyIncome - avgMonthlyExpense;

  const openReceivables = openItems
    .filter((i) => i.kind === "RECEIVABLE")
    .reduce((s, i) => s + i.amount, 0);
  const openPayables = openItems
    .filter((i) => i.kind === "PAYABLE")
    .reduce((s, i) => s + i.amount, 0);

  const runwayMonths =
    netMonthly < 0 && balance > 0 ? Math.floor(balance / -netMonthly) : null;

  return {
    currentBalance: balance,
    avgMonthlyIncome,
    avgMonthlyExpense,
    netMonthly,
    runwayMonths,
    openReceivables,
    openPayables,
    workingCapital: balance + openReceivables - openPayables,
  };
}
