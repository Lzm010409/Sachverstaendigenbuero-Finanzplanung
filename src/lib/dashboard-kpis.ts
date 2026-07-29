import { prisma } from "./db";
import { getKpis, getAnnualBudgetUtilization } from "./analytics";
import { getReceivablesReport } from "./receivables";
import { getWeeklyForecast, getPlanningSettings } from "./planning";
import { getForecast, INCLUDED_ACCOUNT } from "./queries";
import { getConcentration } from "./concentration";
import { getVatForecast } from "./tax";
import { getTransferCategoryIds } from "./queries";
import { todayUTC, addMonths, addDays } from "./dates";
import { formatCents } from "./money";

export type KpiTone = "default" | "positive" | "negative" | "warning";

export interface KpiDescriptor {
  id: string;
  label: string;
  value: string;
  tone?: KpiTone;
  hint?: string;
  href?: string;
  group?: string;
}

// Standardmäßig sichtbare KPIs (Reihenfolge = Anzeige). Der Rest ist über den
// „KPIs anpassen"-Schalter zuschaltbar.
export const DEFAULT_KPI_IDS = ["balance", "income3m", "expense3m", "runway", "workingCapital", "budgetIncome", "budgetExpense"];

const pct = (x: number) => `${Math.round(x * 100)} %`;
const days = (n: number | null) => (n == null ? "–" : `${n} Tage`);

// Liefert ALLE verfügbaren Dashboard-KPIs (aggregiert). Die Sichtbarkeit steuert
// der Client (localStorage); hier wird immer der volle Satz berechnet.
export async function getDashboardKpis(scenarioId?: string): Promise<KpiDescriptor[]> {
  const today = todayUTC();
  const curStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const prevStart = addMonths(curStart, -1);
  const in30 = addDays(today, 30);

  const [kpis, rec, weekly, fc30, fc90, planning, conc, vat, transferIds, monthTx, payables, budgetUtil] = await Promise.all([
    getKpis(),
    getReceivablesReport(),
    getWeeklyForecast(13, scenarioId),
    getForecast(30, scenarioId),
    getForecast(90, scenarioId),
    getPlanningSettings(),
    getConcentration(12, 3),
    getVatForecast(1, 3),
    getTransferCategoryIds(),
    prisma.transaction.findMany({
      where: { bookingDate: { gte: prevStart, lt: addMonths(curStart, 1) }, account: INCLUDED_ACCOUNT, categoryId: { not: null } },
      select: { amount: true, bookingDate: true, categoryId: true },
    }),
    prisma.openItem.findMany({
      where: { paid: false, kind: "PAYABLE", dueDate: { gte: today, lt: in30 } },
      select: { amount: true, paidAmount: true },
    }),
    getAnnualBudgetUtilization(),
  ]);

  // Monats-Ist (laufend + Vormonat), Transfers ausgeklammert.
  let incMTD = 0, expMTD = 0, incPrev = 0;
  for (const t of monthTx) {
    if (t.categoryId && transferIds.has(t.categoryId)) continue;
    const inCur = t.bookingDate >= curStart;
    if (inCur) {
      if (t.amount > 0) incMTD += t.amount;
      else expMTD += -t.amount;
    } else if (t.amount > 0) {
      incPrev += t.amount;
    }
  }
  const incomeGrowth = incPrev > 0 ? (incMTD - incPrev) / incPrev : null;

  const payables30 = payables.reduce((s, p) => s + Math.max(0, p.amount - p.paidAmount), 0);

  // 13-Wochen-Tiefpunkt.
  const low = weekly.weeks.reduce(
    (m, w) => (m == null || w.endLiquidity < m.endLiquidity ? w : m),
    null as (typeof weekly.weeks)[number] | null,
  );
  const buffer = kpis.currentBalance - planning.minLiquidityCents;
  const coverage = kpis.openPayables > 0 ? (kpis.currentBalance + kpis.openReceivables) / kpis.openPayables : null;
  const expenseRatio = kpis.avgMonthlyIncome > 0 ? kpis.avgMonthlyExpense / kpis.avgMonthlyIncome : null;
  const nextVat = vat.periods.find((p) => p.dueDate.getTime() >= today.getTime());

  const list: KpiDescriptor[] = [
    // --- Bestand & Basis ---
    { id: "balance", label: "Verfügbare Liquidität", value: formatCents(kpis.currentBalance), tone: kpis.currentBalance < 0 ? "negative" : "default", href: "/drilldown?metric=balance" },
    { id: "income3m", label: "Ø Einnahmen / Monat", value: formatCents(kpis.avgMonthlyIncome), tone: "positive", hint: "letzte 3 Monate", href: "/drilldown?metric=income3m" },
    { id: "expense3m", label: "Ø Ausgaben / Monat", value: formatCents(-kpis.avgMonthlyExpense), hint: "letzte 3 Monate", href: "/drilldown?metric=expense3m" },
    { id: "netMonthly", label: "Netto-Cashflow / Monat", value: formatCents(kpis.netMonthly), tone: kpis.netMonthly < 0 ? "negative" : "positive", hint: "Ø Einnahmen − Ausgaben" },
    { id: "runway", label: "Reichweite", value: kpis.runwayMonths == null ? "∞" : `${kpis.runwayMonths} Mon.`, tone: kpis.runwayMonths != null && kpis.runwayMonths < 6 ? "warning" : "default", href: "/drilldown?metric=runway" },
    { id: "workingCapital", label: "Working Capital", value: formatCents(kpis.workingCapital), tone: kpis.workingCapital < 0 ? "negative" : "default", hint: "Saldo + Ford. − Verb.", href: "/drilldown?metric=workingCapital" },

    // --- Monat laufend ---
    { id: "incomeMTD", label: "Einnahmen (Monat)", value: formatCents(incMTD), tone: "positive", hint: "laufender Monat" },
    { id: "expenseMTD", label: "Ausgaben (Monat)", value: formatCents(-expMTD), hint: "laufender Monat" },
    { id: "netMTD", label: "Netto (Monat)", value: formatCents(incMTD - expMTD), tone: incMTD - expMTD < 0 ? "negative" : "positive", hint: "laufender Monat" },
    { id: "incomeGrowth", label: "Umsatzwachstum (MoM)", value: incomeGrowth == null ? "–" : `${incomeGrowth >= 0 ? "+" : ""}${Math.round(incomeGrowth * 100)} %`, tone: incomeGrowth == null ? "default" : incomeGrowth < 0 ? "negative" : "positive", hint: "ggü. Vormonat" },
    { id: "expenseRatio", label: "Ausgabenquote", value: expenseRatio == null ? "–" : pct(expenseRatio), tone: expenseRatio != null && expenseRatio > 1 ? "negative" : "default", hint: "Ausgaben / Einnahmen" },

    // --- Forderungen / Verbindlichkeiten ---
    { id: "openReceivables", label: "Offene Forderungen", value: formatCents(kpis.openReceivables), hint: `${rec.count} offen`, href: "/receivables" },
    { id: "overdueReceivables", label: "Überfällige Forderungen", value: formatCents(rec.overdueOpen), tone: rec.overdueOpen > 0 ? "warning" : "default", href: "/receivables" },
    { id: "dso", label: "Debitorenlaufzeit (DSO)", value: days(rec.dsoDays), hint: "Ø Zahlungsdauer", href: "/receivables" },
    { id: "openPayables", label: "Offene Verbindlichkeiten", value: formatCents(kpis.openPayables), href: "/open-items" },
    { id: "payables30", label: "Fällig in 30 Tagen", value: formatCents(payables30), tone: payables30 > kpis.currentBalance ? "warning" : "default", hint: "Verbindlichkeiten", href: "/calendar" },
    { id: "coverage", label: "Liquiditätsdeckung", value: coverage == null ? "∞" : `${coverage.toFixed(1)}×`, tone: coverage != null && coverage < 1 ? "negative" : "default", hint: "(liquide + Ford.) / Verb." },

    // --- Prognose ---
    { id: "forecast30", label: "Prognose Liquidität 30 T", value: formatCents(fc30.endBalance), tone: fc30.endBalance < planning.minLiquidityCents ? "warning" : "default", hint: "in 30 Tagen", href: "/forecast" },
    { id: "forecast90", label: "Prognose Liquidität 90 T", value: formatCents(fc90.endBalance), tone: fc90.endBalance < planning.minLiquidityCents ? "warning" : "default", hint: "in 90 Tagen", href: "/forecast" },
    { id: "lowPoint13w", label: "Tiefpunkt 13 Wochen", value: low ? formatCents(low.endLiquidity) : "–", tone: low && low.endLiquidity < planning.minLiquidityCents ? "negative" : "default", hint: low ? low.label : undefined, href: "/forecast" },
    { id: "minBuffer", label: "Liquiditätspuffer", value: formatCents(buffer), tone: buffer < 0 ? "negative" : "default", hint: "über Mindestbestand", href: "/planning" },

    // --- Steuer & Risiko ---
    { id: "vatNext", label: "USt-Zahllast (nächste)", value: nextVat ? formatCents(nextVat.vatPayable) : "–", tone: nextVat && nextVat.vatPayable > 0 ? "warning" : "default", hint: nextVat ? `fällig ${nextVat.dueDate.toLocaleDateString("de-DE")}` : undefined, href: "/tax" },
    { id: "topDebtor", label: "Klumpenrisiko (Top-1)", value: conc.debtors.length ? pct(conc.top1Share) : "–", tone: conc.top1Share > 0.4 ? "warning" : "default", hint: "Anteil größter Debitor", href: "/concentration" },

    // --- Budget (Ist/Soll Jahr) ---
    {
      id: "budgetIncome",
      label: "Budget Einnahmen (Ist/Soll)",
      value: budgetUtil.income.pct == null ? "–" : pct(budgetUtil.income.pct),
      tone: "default",
      hint: budgetUtil.income.budget > 0 ? `${formatCents(budgetUtil.income.actual)} / ${formatCents(budgetUtil.income.budget)}` : "kein Budget",
      href: "/breakdown",
    },
    {
      id: "budgetExpense",
      label: "Budget Ausgaben (Ist/Soll)",
      value: budgetUtil.expense.pct == null ? "–" : pct(budgetUtil.expense.pct),
      tone: budgetUtil.expense.pct != null && budgetUtil.expense.pct > 1 ? "negative" : "default",
      hint: budgetUtil.expense.budget > 0 ? `${formatCents(-budgetUtil.expense.actual)} / ${formatCents(-budgetUtil.expense.budget)}` : "kein Budget",
      href: "/breakdown",
    },
  ];

  for (const k of list) k.group = KPI_GROUP[k.id] ?? "Weitere";
  return list;
}

// Gruppierung der KPIs (für Dashboard-Anpassung und Berichts-Konfiguration).
export const KPI_GROUP: Record<string, string> = {
  balance: "Bestand & Basis", income3m: "Bestand & Basis", expense3m: "Bestand & Basis",
  netMonthly: "Bestand & Basis", runway: "Bestand & Basis", workingCapital: "Bestand & Basis",
  incomeMTD: "Monat (laufend)", expenseMTD: "Monat (laufend)", netMTD: "Monat (laufend)",
  incomeGrowth: "Monat (laufend)", expenseRatio: "Monat (laufend)",
  openReceivables: "Forderungen & Verbindlichkeiten", overdueReceivables: "Forderungen & Verbindlichkeiten",
  dso: "Forderungen & Verbindlichkeiten", openPayables: "Forderungen & Verbindlichkeiten",
  payables30: "Forderungen & Verbindlichkeiten", coverage: "Forderungen & Verbindlichkeiten",
  forecast30: "Prognose", forecast90: "Prognose", lowPoint13w: "Prognose", minBuffer: "Prognose",
  vatNext: "Steuer & Risiko", topDebtor: "Steuer & Risiko",
  budgetIncome: "Budget (Ist/Soll)", budgetExpense: "Budget (Ist/Soll)",
};

// Reihenfolge der Gruppen für die Anzeige.
export const KPI_GROUP_ORDER = [
  "Bestand & Basis",
  "Monat (laufend)",
  "Budget (Ist/Soll)",
  "Forderungen & Verbindlichkeiten",
  "Prognose",
  "Steuer & Risiko",
  "Weitere",
];
