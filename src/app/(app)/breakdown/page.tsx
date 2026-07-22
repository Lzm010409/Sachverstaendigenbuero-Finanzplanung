import Link from "next/link";
import { getCategoryBreakdown, type BreakdownRow, type Granularity } from "@/lib/analytics";
import { formatCents } from "@/lib/money";
import { budgetCellColor } from "@/lib/budget-color";
import { GranularityToggle } from "@/components/granularity-toggle";
import { PageAlerts } from "@/components/page-alerts";

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
  periods: { key: string; label: string }[];
  divisor: number;
}) {
  if (rows.length === 0) return null;
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
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: r.color }} />
              {r.name}
            </td>
            {r.values.map((v, i) => {
              const bg = budgetCellColor(Math.abs(v), periodBudget, isIncome);
              return (
                <td
                  key={periods[i].key}
                  className="td whitespace-nowrap text-right tabular-nums"
                  style={bg ? { backgroundColor: bg } : undefined}
                >
                  {v === 0 ? <span className="text-slate-300">–</span> : formatCents(v)}
                </td>
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
        zeigt den Verbrauch des laufenden Kalenderjahres am Jahresbudget.
      </p>
    </div>
  );
}
