import { getCashflowMatrix, getCategoryBreakdown, type BreakdownRow } from "@/lib/analytics";
import { getDashboardKpis } from "@/lib/dashboard-kpis";
import { getReceivablesReport } from "@/lib/receivables";
import { getVatForecast } from "@/lib/tax";
import { getWeeklyForecast } from "@/lib/planning";
import { getConcentration } from "@/lib/concentration";
import { getBranding } from "@/lib/settings";
import { getCustomKpiDefs, computeCustomKpis } from "@/lib/custom-kpi";
import { todayUTC } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { ReportBuilder, type ReportData } from "./report-builder";

export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const [kpis, matrix, recv, vat, weekly, conc, branding, customDefs] = await Promise.all([
    getDashboardKpis(),
    // Bis zu 12 Monate laden; im Hochformat zeigt der Bericht ein Fenster davon,
    // im Querformat alle Monate.
    getCashflowMatrix(2, 9),
    getReceivablesReport(),
    getVatForecast(0, 3),
    getWeeklyForecast(13),
    getConcentration(12, 5),
    getBranding(),
    getCustomKpiDefs({ showOnReport: true }),
  ]);
  const custom = customDefs.length ? await computeCustomKpis(customDefs) : [];

  // Budget-Auslastung (Jahr) inkl. linearer Hochrechnung aufs Jahresende.
  const bd = await getCategoryBreakdown("month");
  const elapsed = bd.yearElapsedFraction;
  const showProj = elapsed > 0.02 && elapsed < 0.995;
  const buildBudget = (rows: BreakdownRow[], isIncome: boolean) => {
    const budgeted = rows.filter((r) => r.annualBudget > 0);
    const brows = budgeted.map((r) => {
      const projPct = showProj ? Math.round((r.yearActual / elapsed / r.annualBudget) * 100) : null;
      return {
        name: r.name,
        actual: formatCents(isIncome ? r.yearActual : -r.yearActual),
        budget: formatCents(isIncome ? r.annualBudget : -r.annualBudget),
        pct: r.budgetPct != null ? `${Math.round(r.budgetPct * 100)} %` : "–",
        proj: projPct != null ? `${projPct} %` : null,
        breach: !isIncome && projPct != null && projPct > 100,
      };
    });
    const sumBudget = budgeted.reduce((s, r) => s + r.annualBudget, 0);
    const sumActual = budgeted.reduce((s, r) => s + r.yearActual, 0);
    const sumPctN = sumBudget > 0 ? Math.round((sumActual / sumBudget) * 100) : null;
    const sumProjN = showProj && sumBudget > 0 ? Math.round((sumActual / elapsed / sumBudget) * 100) : null;
    return {
      rows: brows,
      sumActual: formatCents(isIncome ? sumActual : -sumActual),
      sumBudget: formatCents(isIncome ? sumBudget : -sumBudget),
      sumPct: sumPctN != null ? `${sumPctN} %` : "–",
      sumProj: sumProjN != null ? `${sumProjN} %` : null,
      sumBreach: !isIncome && sumProjN != null && sumProjN > 100,
    };
  };
  const budget = {
    showProjection: showProj,
    income: buildBudget(bd.incomeRows, true),
    expense: buildBudget(bd.expenseRows, false),
  };
  const hasBudget = budget.income.rows.length > 0 || budget.expense.rows.length > 0;
  const today = todayUTC();
  const pct = (x: number) => `${Math.round(x * 100)} %`;

  const low = weekly.weeks.reduce(
    (m, w) => (m == null || w.endLiquidity < m.endLiquidity ? w : m),
    null as (typeof weekly.weeks)[number] | null,
  );
  const nextVat = vat.periods.find((p) => p.dueDate >= today && p.vatPayable > 0);

  // Alle Abschnittsdaten serverseitig in Anzeige-Strings vorformatieren, damit
  // die Client-Komponente rein darstellend bleibt (keine Date-Serialisierung).
  const data: ReportData = {
    company: branding.company,
    logoUrl: branding.logoUrl,
    dateLabel: today.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }),
    kpis: kpis.map((k) => ({ id: k.id, label: k.label, value: k.value, hint: k.hint, tone: k.tone, group: k.group })),
    cashflow: {
      months: matrix.months.map((m) => ({
        label: m.label,
        isFuture: m.isFuture,
        start: formatCents(m.startLiquidity),
        inflow: formatCents(m.inflow),
        outflow: formatCents(-m.outflow),
        end: formatCents(m.endLiquidity),
        endNegative: m.endLiquidity < 0,
      })),
    },
    weekly: {
      startBalance: formatCents(weekly.startBalance),
      endBalance: weekly.weeks.length ? formatCents(weekly.weeks[weekly.weeks.length - 1].endLiquidity) : "–",
      low: low ? { label: low.label, value: formatCents(low.endLiquidity), negative: low.endLiquidity < 0 } : null,
      weeks: weekly.weeks.map((w) => ({
        label: w.label,
        start: formatCents(w.startLiquidity),
        inflow: formatCents(w.inflow),
        outflow: formatCents(-w.outflow),
        end: formatCents(w.endLiquidity),
        below: w.belowThreshold,
      })),
    },
    receivables: {
      buckets: recv.buckets.map((b) => ({ label: b.label, amount: formatCents(b.amount), count: b.count })),
      totalOpen: formatCents(recv.totalOpen),
      overdueOpen: formatCents(recv.overdueOpen),
      dso: recv.dsoDays != null ? `${recv.dsoDays} Tage` : "—",
    },
    vat: {
      periods: vat.periods.map((p) => ({ label: p.label, payable: formatCents(p.vatPayable), estimate: p.isEstimate })),
      next: nextVat ? { payable: formatCents(nextVat.vatPayable), date: nextVat.dueDate.toLocaleDateString("de-DE"), label: nextVat.label } : null,
    },
    concentration: {
      debtors: conc.debtors.slice(0, 10).map((d) => ({ name: d.name, revenue: formatCents(d.revenue), share: pct(d.share) })),
      hhi: conc.hhi,
      top1: conc.debtors.length ? pct(conc.top1Share) : "–",
      top3: conc.debtors.length ? pct(conc.top3Share) : "–",
      total: formatCents(conc.totalRevenue),
    },
    custom,
    budget: hasBudget ? budget : null,
  };

  return <ReportBuilder data={data} />;
}
