import Link from "next/link";
import { getCategoryBreakdown, type BreakdownRow, type Granularity } from "@/lib/analytics";
import { formatCents } from "@/lib/money";
import { budgetCellColor } from "@/lib/budget-color";
import { GranularityToggle } from "@/components/granularity-toggle";
import { PageAlerts } from "@/components/page-alerts";
import { BreakdownRowInfo } from "./row-info";
import { CellHover } from "@/components/cell-hover";

export const dynamic = "force-dynamic";

function pctLabel(pct: number | null): string {
  if (pct == null) return "–";
  return `${Math.round(pct * 100)} %`;
}

function Section({
  title,
  rows,
  periods,
  divisor,
}: {
  title: string;
  rows: BreakdownRow[];
  periods: { key: string; label: string; start: Date; end: Date }[];
  divisor: number;
}) {
  if (rows.length === 0) return null;
  const isIncomeSection = rows[0].kind === "INCOME";
  // Kumulierte Werte der Sektion: Spaltensummen (Ist je Zeitraum) sowie
  // Jahres-Ist/-Budget (nur Kategorien mit Budget) für den Ist/Soll-Vergleich.
  const periodSums = periods.map((_, i) => rows.reduce((s, r) => s + (r.values[i] ?? 0), 0));
  const budgeted = rows.filter((r) => r.annualBudget > 0);
  const sumBudget = budgeted.reduce((s, r) => s + r.annualBudget, 0);
  const sumActual = budgeted.reduce((s, r) => s + r.yearActual, 0);
  const sumPct = sumBudget > 0 ? Math.round((sumActual / sumBudget) * 100) : null;
  const sumBg = budgetCellColor(sumActual, sumBudget, isIncomeSection);
  // Budget-Auslastung je Zeitraum: Ist der budgetierten Kategorien gegen das
  // anteilige Perioden-Budget (Jahresbudget / Divisor: 12 Monat, 52 Woche, 1 Jahr).
  const periodBudgetTotal = sumBudget / divisor;
  const periodBudgetedSums = periods.map((_, i) => budgeted.reduce((s, r) => s + (r.values[i] ?? 0), 0));
  const periodPct = periodBudgetedSums.map((v) =>
    periodBudgetTotal > 0 ? Math.round((Math.abs(v) / periodBudgetTotal) * 100) : null,
  );
  return (
    <>
      <tr className="bg-slate-50">
        <td className="td font-semibold text-slate-700" colSpan={periods.length + 3}>
          {title}
        </td>
      </tr>
      {rows.map((r) => {
        const isIncome = r.kind === "INCOME";
        const periodBudget = r.annualBudget > 0 ? r.annualBudget / divisor : 0;
        return (
          <tr key={r.categoryId ?? r.name} className="border-b border-slate-50">
            <td className="td sticky left-0 z-10 bg-white font-medium">
              <BreakdownRowInfo
                name={r.name}
                color={r.color}
                isIncome={isIncome}
                periods={periods}
                values={r.values}
                periodBudget={Math.round(periodBudget)}
                annualBudget={r.annualBudget}
                yearActual={r.yearActual}
                budgetPct={r.budgetPct}
              />
            </td>
            {r.values.map((v, i) => {
              const bg = budgetCellColor(Math.abs(v), periodBudget, isIncome);
              const from = periods[i].start.toISOString().slice(0, 10);
              const to = new Date(periods[i].end.getTime() - 86_400_000).toISOString().slice(0, 10);
              return (
                <CellHover
                  key={periods[i].key}
                  query={{ cat: r.categoryId ?? "none", from, to }}
                  title={`${r.name} · ${periods[i].label}`}
                  className="td whitespace-nowrap text-right tabular-nums"
                  style={bg ? { backgroundColor: bg } : undefined}
                >
                  {v === 0 ? <span className="text-slate-300">–</span> : formatCents(v)}
                </CellHover>
              );
            })}
            <td className="td whitespace-nowrap text-right text-slate-500">
              {r.annualBudget > 0 ? formatCents(isIncome ? r.annualBudget : -r.annualBudget) : "–"}
            </td>
            <td
              className="td whitespace-nowrap text-right font-semibold"
              style={
                budgetCellColor(r.yearActual, r.annualBudget, isIncome)
                  ? { backgroundColor: budgetCellColor(r.yearActual, r.annualBudget, isIncome) }
                  : undefined
              }
            >
              {pctLabel(r.budgetPct)}
            </td>
          </tr>
        );
      })}
      {/* Kumulierte Summenzeile der Sektion (Ist je Zeitraum + Ist/Soll Jahr). */}
      <tr className="border-y-2 border-slate-200 bg-slate-100 font-semibold text-slate-800">
        <td className="td sticky left-0 z-10 bg-slate-100">Summe {title}</td>
        {periodSums.map((v, i) => (
          <td key={periods[i].key} className="td whitespace-nowrap text-right tabular-nums">
            {v === 0 ? <span className="text-slate-300">–</span> : formatCents(v)}
            {periodPct[i] != null && (
              <div
                className={`text-[10px] font-normal ${!isIncomeSection && periodPct[i]! > 100 ? "text-red-600" : "text-slate-400"}`}
                title={`Budget-Auslastung ${periods[i].label}: ${periodPct[i]} % des anteiligen Budgets`}
              >
                {periodPct[i]} % Budget
              </div>
            )}
          </td>
        ))}
        <td className="td whitespace-nowrap text-right tabular-nums">
          {sumBudget > 0 ? formatCents(isIncomeSection ? sumBudget : -sumBudget) : "–"}
        </td>
        <td
          className="td whitespace-nowrap text-right"
          style={sumBg ? { backgroundColor: sumBg } : undefined}
          title={sumBudget > 0 ? `Ist ${formatCents(isIncomeSection ? sumActual : -sumActual)} / Soll ${formatCents(isIncomeSection ? sumBudget : -sumBudget)}` : undefined}
        >
          {sumPct != null ? `${sumPct} %` : "–"}
        </td>
      </tr>
    </>
  );
}

export default async function BreakdownPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; offset?: string }>;
}) {
  const sp = await searchParams;
  const granularity: Granularity =
    sp.g === "week" || sp.g === "year" ? (sp.g as Granularity) : "month";
  const offset = Math.max(0, Number(sp.offset) || 0);
  const data = await getCategoryBreakdown(granularity, offset);
  const hasRows = data.incomeRows.length > 0 || data.expenseRows.length > 0;
  const rangeLabel = `${data.periods[0]?.label} – ${data.periods[data.periods.length - 1]?.label}`;
  const qs = (o: number) => `/breakdown?g=${granularity}${o > 0 ? `&offset=${o}` : ""}`;

  // Gesamt-Budgetauslastung des laufenden Jahres (nur Kategorien mit Budget):
  // Summe Ist / Summe Jahresbudget – getrennt für Einnahmen und Ausgaben.
  const sumOver = (rows: BreakdownRow[], sel: (r: BreakdownRow) => number) =>
    rows.filter((r) => r.annualBudget > 0).reduce((s, r) => s + sel(r), 0);
  const incActual = sumOver(data.incomeRows, (r) => r.yearActual);
  const incBudget = sumOver(data.incomeRows, (r) => r.annualBudget);
  const expActual = sumOver(data.expenseRows, (r) => r.yearActual);
  const expBudget = sumOver(data.expenseRows, (r) => r.annualBudget);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
  const incPct = pct(incActual, incBudget);
  const expPct = pct(expActual, expBudget);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auswertung</h1>
          <p className="text-sm text-slate-500">
            Transaktionen je Kategorie und Zeitraum, inkl. Jahresbudget-Verbrauch
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Link href={qs(offset + 1)} className="btn-secondary px-2 py-1 text-sm" title="früher">←</Link>
            <span className="min-w-[130px] text-center text-sm text-slate-600">{rangeLabel}</span>
            {offset > 0 ? (
              <Link href={qs(offset - 1)} className="btn-secondary px-2 py-1 text-sm" title="später">→</Link>
            ) : (
              <span className="btn-secondary cursor-not-allowed px-2 py-1 text-sm opacity-40">→</span>
            )}
          </div>
          <GranularityToggle current={granularity} />
        </div>
      </div>

      <PageAlerts page="/breakdown" />

      <div className="card overflow-x-auto p-0">
        {!hasRows ? (
          <p className="p-5 text-sm text-slate-400">Keine Daten im gewählten Zeitraum.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="th sticky left-0 z-10 bg-white">Kategorie</th>
                {data.periods.map((p) => {
                  const from = p.start.toISOString().slice(0, 10);
                  const to = new Date(p.end.getTime() - 86_400_000).toISOString().slice(0, 10);
                  return (
                    <th key={p.key} className="th text-right">
                      <Link href={`/drilldown?metric=range&from=${from}&to=${to}`} className="hover:text-brand hover:underline">
                        {p.label}
                      </Link>
                    </th>
                  );
                })}
                <th className="th text-right">Jahresbudget</th>
                <th className="th text-right">% Jahr</th>
              </tr>
            </thead>
            <tbody>
              <Section title="Einnahmen" rows={data.incomeRows} periods={data.periods} divisor={data.periodBudgetDivisor} />
              <Section title="Ausgaben" rows={data.expenseRows} periods={data.periods} divisor={data.periodBudgetDivisor} />
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Die Zellfarbe zeigt den Budgetverbrauch je Zeitraum (grün = im Rahmen, rot = überzogen; bei
        Einnahmen umgekehrt). Budgets pflegst du unter <strong>Kategorien</strong>. Die Spalte „% Jahr"
        zeigt den Verbrauch des laufenden Kalenderjahres am Jahresbudget. Die Zeile
        <strong> „Summe Einnahmen/Ausgaben"</strong> kumuliert je Zeitraum (Ist) sowie das gesamte
        Jahresbudget (Soll) und dessen Auslastung. Der Wert <strong>„… % Budget"</strong> je Monat zeigt,
        wie viel des <em>anteiligen</em> Gesamtbudgets (Jahresbudget ÷ 12 bzw. ÷ 52 je Woche) in diesem
        Zeitraum verbraucht wurde. Das Feld unten rechts zeigt den Jahres-Ist/Soll-Vergleich.
      </p>

      {hasRows && (incPct != null || expPct != null) && (
        <div className="fixed bottom-4 right-4 z-40 rounded-lg border border-slate-200 bg-white/95 px-4 py-2.5 text-sm shadow-lg backdrop-blur">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Budget Ist / Soll (Jahr)
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Einnahmen
              </span>
              <span className="tabular-nums text-slate-600">
                {formatCents(incActual)} / {formatCents(incBudget)}
                <strong className="ml-2 text-emerald-700">{incPct != null ? `${incPct} %` : "–"}</strong>
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                Ausgaben
              </span>
              <span className="tabular-nums text-slate-600">
                {formatCents(-expActual)} / {formatCents(-expBudget)}
                <strong className={`ml-2 ${expPct != null && expPct > 100 ? "text-red-600" : "text-slate-800"}`}>
                  {expPct != null ? `${expPct} %` : "–"}
                </strong>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
