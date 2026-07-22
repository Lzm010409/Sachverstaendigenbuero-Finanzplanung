import Link from "next/link";
import { getBudgetStatus, getCashflowMatrix, getKpis, type CashflowCatRow, type CashflowMonth } from "@/lib/analytics";
import { getForecast } from "@/lib/queries";
import { getPlanningSettings, findThresholdBreach } from "@/lib/planning";
import { formatCents } from "@/lib/money";
import { CashflowChart } from "@/components/cashflow-chart";
import { BudgetStatusCard } from "@/components/budget-status-card";

export const dynamic = "force-dynamic";

function eur(cents: number): string {
  if (cents === 0) return "–";
  return (cents / 100).toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €";
}

function Stat({
  label,
  value,
  tone = "default",
  hint,
  href,
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative" | "warning";
  hint?: string;
  href?: string;
}) {
  const toneClass =
    tone === "negative"
      ? "text-red-600"
      : tone === "positive"
        ? "text-emerald-600"
        : tone === "warning"
          ? "text-amber-600"
          : "text-slate-900";
  const inner = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="card block transition hover:ring-2 hover:ring-brand/30">
        {inner}
        <div className="mt-1 text-xs text-brand">Details →</div>
      </Link>
    );
  }
  return <div className="card">{inner}</div>;
}

function Cell({ value, month, tone }: { value: number; month: CashflowMonth; tone?: "in" | "out" }) {
  const color = tone === "in" ? "text-emerald-700" : tone === "out" ? "text-red-600" : "text-slate-700";
  return (
    <td
      className={`whitespace-nowrap px-3 py-1.5 text-right text-sm tabular-nums ${color} ${month.isCurrent ? "bg-brand/5" : ""}`}
    >
      {value === 0 ? <span className="text-slate-300">–</span> : eur(value)}
    </td>
  );
}

function CatRow({ row, months }: { row: CashflowCatRow; months: CashflowMonth[] }) {
  const isIncome = row.kind === "INCOME";
  return (
    <tr className="border-b border-slate-50">
      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-sm text-slate-700">
        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: row.color }} />
        {row.name}
      </td>
      {row.values.map((v, i) => (
        <Cell key={months[i].key} value={v} month={months[i]} tone={isIncome ? "in" : "out"} />
      ))}
    </tr>
  );
}

function SummaryRow({
  label,
  values,
  months,
  strong,
  tone,
  muted,
}: {
  label: string;
  values: number[];
  months: CashflowMonth[];
  strong?: boolean;
  tone?: "in" | "out";
  muted?: boolean;
}) {
  return (
    <tr className={strong ? "bg-slate-50" : ""}>
      <td className={`sticky left-0 z-10 px-3 py-1.5 text-sm ${strong ? "bg-slate-50 font-semibold text-slate-800" : muted ? "bg-white pl-6 italic text-slate-400" : "bg-white text-slate-600"}`}>
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={months[i].key}
          className={`whitespace-nowrap px-3 py-1.5 text-right text-sm tabular-nums ${strong ? "font-semibold" : ""} ${muted ? "italic opacity-70" : ""} ${v < 0 ? "text-red-600" : tone === "in" ? "text-emerald-700" : "text-slate-800"} ${months[i].isCurrent ? "bg-brand/10" : strong ? "bg-slate-50" : ""}`}
        >
          {v === 0 ? <span className="text-slate-300">–</span> : eur(v)}
        </td>
      ))}
    </tr>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const sp = await searchParams;
  const offset = Math.max(0, Number(sp.offset) || 0);
  const [kpis, matrix, forecast, planning, budgetStatus] = await Promise.all([
    getKpis(),
    getCashflowMatrix(6, 6, offset),
    getForecast(180),
    getPlanningSettings(),
    getBudgetStatus(),
  ]);
  const { months } = matrix;
  const breach = findThresholdBreach(forecast, planning.minLiquidityCents);
  const rangeLabel = `${months[0]?.label} – ${months[months.length - 1]?.label}`;
  const qs = (o: number) => (o > 0 ? `/?offset=${o}` : "/");

  const lowestFuture = months
    .filter((m) => m.isFuture || m.isCurrent)
    .reduce<CashflowMonth | null>((min, m) => (!min || m.endLiquidity < min.endLiquidity ? m : min), null);
  const warnNegative = lowestFuture && lowestFuture.endLiquidity < 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Übersicht</h1>
          <p className="text-sm text-slate-500">Liquidität, Ein- und Auszahlungen je Monat</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Link href={qs(offset + 6)} className="btn-secondary px-2 py-1 text-sm" title="6 Monate früher">◄</Link>
            <span className="min-w-[150px] text-center text-sm text-slate-600">{rangeLabel}</span>
            {offset > 0 ? (
              <Link href={qs(Math.max(0, offset - 6))} className="btn-secondary px-2 py-1 text-sm" title="6 Monate später">►</Link>
            ) : (
              <span className="btn-secondary cursor-not-allowed px-2 py-1 text-sm opacity-40">►</span>
            )}
            {offset > 0 && <Link href="/" className="ml-1 text-xs text-brand hover:underline">heute</Link>}
          </div>
          <Link href="/scenarios" className="text-sm font-medium text-brand hover:underline">
            Szenarien →
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Verfügbare Liquidität" value={formatCents(kpis.currentBalance)} tone={kpis.currentBalance < 0 ? "negative" : "default"} href="/drilldown?metric=balance" />
        <Stat label="Ø Einnahmen / Monat" value={formatCents(kpis.avgMonthlyIncome)} tone="positive" hint="letzte 3 Monate" href="/drilldown?metric=income3m" />
        <Stat label="Ø Ausgaben / Monat" value={formatCents(-kpis.avgMonthlyExpense)} hint="letzte 3 Monate" href="/drilldown?metric=expense3m" />
        <Stat
          label="Reichweite"
          value={kpis.runwayMonths == null ? "∞" : `${kpis.runwayMonths} Mon.`}
          tone={kpis.runwayMonths != null && kpis.runwayMonths < 6 ? "warning" : "default"}
          href="/drilldown?metric=runway"
        />
        <Stat label="Working Capital" value={formatCents(kpis.workingCapital)} tone={kpis.workingCapital < 0 ? "negative" : "default"} hint="Saldo + Ford. − Verb." href="/drilldown?metric=workingCapital" />
      </div>

      {warnNegative && lowestFuture && (
        <div className="card flex items-start gap-3 border-red-200 bg-red-50">
          <span className="text-xl">⚠️</span>
          <div className="text-sm text-red-800">
            <strong>Liquiditätswarnung:</strong> Im {lowestFuture.label} sinkt die prognostizierte
            Liquidität auf {formatCents(lowestFuture.endLiquidity)}.
          </div>
        </div>
      )}

      {breach && (
        <div className="card flex items-start gap-3 border-amber-200 bg-amber-50">
          <span className="text-xl">🔔</span>
          <div className="text-sm text-amber-800">
            <strong>Mindestliquidität unterschritten:</strong> Am{" "}
            {new Date(breach.date).toLocaleDateString("de-DE")} ({breach.daysAway} Tage) fällt die
            Prognose auf {formatCents(breach.balance)} — unter deine Schwelle von{" "}
            {formatCents(breach.threshold)}.{" "}
            <Link href="/forecast" className="underline">13-Wochen-Vorschau →</Link>
          </div>
        </div>
      )}

      <div className="card">
        <CashflowChart
          points={months.map((m) => ({
            label: m.label,
            inflow: m.inflow,
            outflow: m.outflow,
            inflowRealized: m.inflowRealized,
            inflowPlanned: m.inflowPlanned,
            outflowRealized: m.outflowRealized,
            outflowPlanned: m.outflowPlanned,
            endLiquidity: m.endLiquidity,
            isFuture: m.isFuture,
            isCurrent: m.isCurrent,
          }))}
          thresholdCents={planning.minLiquidityCents}
        />
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Einzahlung realisiert</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-300" /> Einzahlung geplant</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" /> Auszahlung realisiert</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-300" /> Auszahlung geplant</span>
        </div>
      </div>

      <BudgetStatusCard status={budgetStatus} />

      <div className="card overflow-x-auto p-0">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Kategorie
              </th>
              {months.map((m) => (
                <th
                  key={m.key}
                  className={`whitespace-nowrap px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide ${m.isCurrent ? "bg-brand/10 text-brand-fg" : "text-slate-500"}`}
                >
                  <Link href={`/drilldown?metric=range&from=${m.startISO}&to=${m.endISO}`} className="hover:text-brand hover:underline" title="Bewegungen anzeigen">
                    {m.label}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SummaryRow label="Liquidität Start" values={months.map((m) => m.startLiquidity)} months={months} />
            <SummaryRow label="Einzahlungen" values={months.map((m) => m.inflow)} months={months} tone="in" />
            <SummaryRow label="· realisiert" values={months.map((m) => m.inflowRealized)} months={months} tone="in" muted />
            <SummaryRow label="· geplant" values={months.map((m) => m.inflowPlanned)} months={months} tone="in" muted />
            <SummaryRow label="Auszahlungen" values={months.map((m) => -m.outflow)} months={months} />
            <SummaryRow label="· realisiert" values={months.map((m) => -m.outflowRealized)} months={months} muted />
            <SummaryRow label="· geplant" values={months.map((m) => -m.outflowPlanned)} months={months} muted />
            <SummaryRow label="Nettoveränderung" values={months.map((m) => m.net)} months={months} />
            <SummaryRow label="Liquidität Ende" values={months.map((m) => m.endLiquidity)} months={months} strong />

            <tr className="bg-emerald-50/60">
              <td className="sticky left-0 z-10 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase text-emerald-700" colSpan={months.length + 1}>
                Einnahmen
              </td>
            </tr>
            {matrix.incomeRows.length === 0 ? (
              <tr><td className="px-3 py-1.5 text-sm text-slate-400" colSpan={months.length + 1}>—</td></tr>
            ) : (
              matrix.incomeRows.map((r) => <CatRow key={r.categoryId ?? r.name} row={r} months={months} />)
            )}

            <tr className="bg-red-50/60">
              <td className="sticky left-0 z-10 bg-red-50 px-3 py-1.5 text-xs font-semibold uppercase text-red-700" colSpan={months.length + 1}>
                Ausgaben
              </td>
            </tr>
            {matrix.expenseRows.length === 0 ? (
              <tr><td className="px-3 py-1.5 text-sm text-slate-400" colSpan={months.length + 1}>—</td></tr>
            ) : (
              matrix.expenseRows.map((r) => <CatRow key={r.categoryId ?? r.name} row={r} months={months} />)
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Vergangene Monate zeigen gebuchte Umsätze, künftige Monate die Planposten und offenen
        Posten. Die Liquiditäts-Endwerte sind auf den aktuellen Kontostand verankert. Budgets &amp;
        Farbverläufe je Kategorie findest du unter <Link href="/breakdown" className="text-brand underline">Auswertung</Link>.
      </p>
    </div>
  );
}
