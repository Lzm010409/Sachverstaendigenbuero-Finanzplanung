import { prisma } from "./db";
import { addDays, addMonths, isoDate, startOfDayUTC, todayUTC } from "./dates";
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
  offset = 0, // 0 = aktuell; jede Stufe verschiebt das Fenster um eine volle Periode zurück
): Promise<BreakdownResult> {
  const base = todayUTC();
  const back = Math.max(0, Math.floor(offset));
  let ref = base;
  if (back > 0) {
    if (granularity === "month") ref = addMonths(base, -12 * back);
    else if (granularity === "week") ref = addDays(base, -7 * 12 * back);
    else ref = new Date(Date.UTC(base.getUTCFullYear() - 4 * back, base.getUTCMonth(), base.getUTCDate()));
  }
  const periods = buildPeriods(granularity, ref);
  const rangeStart = periods[0].start;
  const rangeEnd = periods[periods.length - 1].end;
  const yearStart = new Date(Date.UTC(ref.getUTCFullYear(), 0, 1));
  const yearEnd = new Date(Date.UTC(ref.getUTCFullYear() + 1, 0, 1));

  const [categories, txs, yearTxs] = await Promise.all([
    prisma.category.findMany({ where: { deletedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
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

export interface CashflowMonth {
  key: string;
  label: string;
  startISO: string;
  endISO: string; // letzter Tag des Monats (inklusiv)
  isFuture: boolean;
  isCurrent: boolean;
  inflow: number;
  outflow: number; // positiv dargestellt
  // Aufteilung realisiert (gebuchte Umsätze) vs. geplant (offene Posten +
  // Planposten). Bei Teilzahlungen: bezahlter Teil realisiert (am Zahldatum),
  // Rest geplant (zum Fälligkeitsdatum).
  inflowRealized: number;
  inflowPlanned: number;
  outflowRealized: number; // positiv
  outflowPlanned: number; // positiv
  net: number;
  startLiquidity: number;
  endLiquidity: number;
}

export interface CashflowCatRow {
  categoryId: string | null;
  name: string;
  kind: "INCOME" | "EXPENSE" | "MIXED";
  color: string;
  values: number[]; // signierte Summe je Monat (Cent)
}

export interface CashflowMatrix {
  months: CashflowMonth[];
  incomeRows: CashflowCatRow[];
  expenseRows: CashflowCatRow[];
}

const MONTHS_LONG = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

/**
 * Monats-Cashflow-Matrix im finban-Stil: Vergangenheit aus gebuchten Umsätzen,
 * Zukunft aus Planposten + offenen Posten. Enthält je Monat die
 * Liquiditäts-Start/-Ende-Werte (auf den heutigen Kontostand verankert).
 */
export async function getCashflowMatrix(
  monthsBack = 6,
  monthsForward = 6,
  monthOffset = 0, // 0 = aktuell; > 0 verschiebt das Fenster um n Monate zurück
): Promise<CashflowMatrix> {
  const { occurrencesBetween } = await import("./recurrence");
  const today = todayUTC();
  const back = Math.max(0, Math.floor(monthOffset));
  const curMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  // Fenstermitte um `back` Monate in die Vergangenheit verschieben.
  const windowCenter = addMonths(curMonthStart, -back);
  const rangeStart = addMonths(windowCenter, -monthsBack);
  const rangeEnd = addMonths(windowCenter, monthsForward + 1); // exklusiv

  const months: { key: string; start: Date; end: Date; label: string; isFuture: boolean; isCurrent: boolean }[] = [];
  for (let i = -monthsBack; i <= monthsForward; i++) {
    const start = addMonths(windowCenter, i);
    const end = addMonths(start, 1);
    // isCurrent/isFuture beziehen sich immer auf HEUTE, nicht auf die Fenstermitte.
    months.push({
      key: `${start.getUTCFullYear()}-${start.getUTCMonth() + 1}`,
      start,
      end,
      label: `${MONTHS_LONG[start.getUTCMonth()]} ${String(start.getUTCFullYear()).slice(2)}`,
      isFuture: start.getTime() > today.getTime(),
      isCurrent: today.getTime() >= start.getTime() && today.getTime() < end.getTime(),
    });
  }

  const [categories, txs, planned, openItems, balance] = await Promise.all([
    prisma.category.findMany({ where: { deletedAt: null } }),
    prisma.transaction.findMany({
      where: { bookingDate: { gte: rangeStart, lt: rangeEnd }, account: INCLUDED_ACCOUNT },
      select: { categoryId: true, amount: true, bookingDate: true },
    }),
    prisma.plannedItem.findMany({ where: { active: true } }),
    prisma.openItem.findMany({ where: { paid: false } }),
    getTotalBalanceCents(),
  ]);

  const monthIndex = (d: Date): number =>
    months.findIndex((m) => d.getTime() >= m.start.getTime() && d.getTime() < m.end.getTime());

  // Zukünftige Events (Planposten ab morgen + offene Posten ab heute).
  const tomorrow = addDays(today, 1);
  interface Ev {
    date: Date;
    amount: number;
    categoryId: string | null;
  }
  const futureEvents: Ev[] = [];
  for (const p of planned) {
    for (const date of occurrencesBetween(p, tomorrow, addDays(rangeEnd, -1))) {
      futureEvents.push({ date, amount: p.amount, categoryId: p.categoryId });
    }
  }
  for (const oi of openItems) {
    // Nur den noch offenen Rest als "geplant" ansetzen (bezahlter Teil steckt
    // bereits als gebuchter Umsatz in `txs` = realisiert). Verhindert Doppel-
    // zählung bei Teilzahlungen.
    const remaining = oi.amount - oi.paidAmount;
    if (remaining <= 0) continue;
    const date = oi.dueDate.getTime() < today.getTime() ? today : startOfDayUTC(oi.dueDate);
    if (date.getTime() >= rangeEnd.getTime()) continue;
    futureEvents.push({
      date,
      amount: oi.kind === "RECEIVABLE" ? remaining : -remaining,
      categoryId: oi.categoryId,
    });
  }

  // Aggregation je Kategorie × Monat + Zu-/Abflüsse je Monat.
  const catKey = (id: string | null) => id ?? "__none__";
  const perCat = new Map<string, number[]>();
  const inflow = new Array(months.length).fill(0);
  const outflow = new Array(months.length).fill(0);
  const inflowRealized = new Array(months.length).fill(0);
  const inflowPlanned = new Array(months.length).fill(0);
  const outflowRealized = new Array(months.length).fill(0);
  const outflowPlanned = new Array(months.length).fill(0);
  const addValue = (mi: number, cid: string | null, amount: number, realized: boolean) => {
    if (mi < 0) return;
    const k = catKey(cid);
    if (!perCat.has(k)) perCat.set(k, new Array(months.length).fill(0));
    perCat.get(k)![mi] += amount;
    if (amount >= 0) {
      inflow[mi] += amount;
      if (realized) inflowRealized[mi] += amount;
      else inflowPlanned[mi] += amount;
    } else {
      outflow[mi] += -amount;
      if (realized) outflowRealized[mi] += -amount;
      else outflowPlanned[mi] += -amount;
    }
  };
  for (const t of txs) addValue(monthIndex(t.bookingDate), t.categoryId, t.amount, true);
  for (const e of futureEvents) addValue(monthIndex(e.date), e.categoryId, e.amount, false);

  // Liquiditäts-Walk, verankert am aktuellen Kontostand – gültig für jedes
  // Fenster (Vergangenheit/Gegenwart/Zukunft). Idee: Liquidität an der rechten
  // Fenstergrenze (rangeEnd) aus dem heutigen Saldo herleiten, dann rückwärts
  // mit den Monats-Nettos gehen (Start + Netto = Ende, lückenlos verkettet).
  const net = months.map((_, i) => inflow[i] - outflow[i]);
  let endOfWindow: number;
  if (rangeEnd.getTime() <= today.getTime()) {
    // Fenster liegt komplett in der Vergangenheit: heutigen Saldo um die seither
    // gebuchten Umsätze zurückrechnen.
    const gap = await prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { bookingDate: { gte: rangeEnd, lte: today }, account: INCLUDED_ACCOUNT },
    });
    endOfWindow = balance - (gap._sum.amount ?? 0);
  } else {
    // Fenster reicht in die Zukunft: geplante Bewegungen bis rangeEnd aufaddieren.
    endOfWindow = balance + futureEvents
      .filter((e) => e.date.getTime() > today.getTime() && e.date.getTime() < rangeEnd.getTime())
      .reduce((s, e) => s + e.amount, 0);
  }
  const startLiq = new Array(months.length).fill(0);
  const endLiq = new Array(months.length).fill(0);
  const last = months.length - 1;
  endLiq[last] = endOfWindow;
  startLiq[last] = endLiq[last] - net[last];
  for (let i = last - 1; i >= 0; i--) {
    endLiq[i] = startLiq[i + 1];
    startLiq[i] = endLiq[i] - net[i];
  }

  const catInfo = new Map(categories.map((c) => [c.id, c]));
  const buildRows = (kind: "INCOME" | "EXPENSE"): CashflowCatRow[] => {
    const rows: CashflowCatRow[] = [];
    for (const [k, values] of perCat) {
      const cat = k === "__none__" ? null : catInfo.get(k);
      const rowKind = cat?.kind ?? "MIXED";
      const isIncome = rowKind === "INCOME";
      if (kind === "INCOME" ? !isIncome : isIncome) continue;
      if (values.every((v) => v === 0)) continue;
      rows.push({
        categoryId: cat?.id ?? null,
        name: cat?.name ?? "Unkategorisiert",
        kind: rowKind,
        color: cat?.color ?? "#94a3b8",
        values,
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  };

  return {
    months: months.map((m, i) => ({
      key: m.key,
      label: m.label,
      startISO: isoDate(m.start),
      endISO: isoDate(addDays(m.end, -1)),
      isFuture: m.isFuture,
      isCurrent: m.isCurrent,
      inflow: inflow[i],
      outflow: outflow[i],
      inflowRealized: inflowRealized[i],
      inflowPlanned: inflowPlanned[i],
      outflowRealized: outflowRealized[i],
      outflowPlanned: outflowPlanned[i],
      net: net[i],
      startLiquidity: startLiq[i],
      endLiquidity: endLiq[i],
    })),
    incomeRows: buildRows("INCOME"),
    expenseRows: buildRows("EXPENSE"),
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
    prisma.openItem.findMany({
      where: { paid: false },
      select: { kind: true, amount: true, paidAmount: true },
    }),
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

  const openOf = (i: { amount: number; paidAmount: number }) => Math.max(0, i.amount - i.paidAmount);
  const openReceivables = openItems
    .filter((i) => i.kind === "RECEIVABLE")
    .reduce((s, i) => s + openOf(i), 0);
  const openPayables = openItems
    .filter((i) => i.kind === "PAYABLE")
    .reduce((s, i) => s + openOf(i), 0);

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
