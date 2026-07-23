import Link from "next/link";
import { getWeeklyForecast, getPlanningSettings } from "@/lib/planning";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { CashflowChart } from "@/components/cashflow-chart";
import { CellHover } from "@/components/cell-hover";

export const dynamic = "force-dynamic";

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; w?: string }>;
}) {
  const sp = await searchParams;
  const weeks = Math.min(26, Math.max(4, Number(sp.w) || 13));
  const [planning, scenarios] = await Promise.all([
    getPlanningSettings(),
    prisma.scenario.findMany({ orderBy: { name: "asc" } }),
  ]);
  const { weeks: buckets } = await getWeeklyForecast(weeks, sp.s || undefined, planning.minLiquidityCents);

  const lowest = buckets.reduce((min, b) => (b.endLiquidity < min.endLiquidity ? b : min), buckets[0]);
  const overdue = buckets[0]?.overdueInflow ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{weeks}-Wochen-Liquiditätsvorschau</h1>
          <p className="text-sm text-slate-500">Rollierend ab dieser Woche · Wochenstart Montag</p>
        </div>
        <form method="get" className="flex items-end gap-2">
          <div>
            <label className="label">Szenario</label>
            <select name="s" defaultValue={sp.s ?? ""} className="input w-auto py-1 text-sm">
              <option value="">Basis</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Wochen</label>
            <select name="w" defaultValue={String(weeks)} className="input w-auto py-1 text-sm">
              {[8, 13, 26].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button className="btn-secondary px-3 py-1 text-sm" type="submit">Anzeigen</button>
        </form>
      </div>

      {overdue > 0 && (
        <div className="card flex items-start gap-3 border-sky-200 bg-sky-50 text-sm text-sky-900">
          <span className="text-xl">ℹ️</span>
          <div>
            Die erste Woche enthält <strong>{formatCents(overdue)}</strong> aus bereits <strong>überfälligen
            Forderungen</strong> (Rückstand), die die Vorschau als „jetzt fällig" ansetzt. Das erklärt einen hohen
            Zufluss in KW {buckets[0].label.split(" ")[1]}.{" "}
            <Link href="/receivables" className="underline">Forderungen ansehen →</Link>
          </div>
        </div>
      )}

      {lowest && lowest.belowThreshold && (
        <div className="card flex items-start gap-3 border-amber-200 bg-amber-50 text-sm text-amber-800">
          <span className="text-xl">🔔</span>
          <div>
            Tiefpunkt in {lowest.label}: {formatCents(lowest.endLiquidity)} — unter der Mindestliquidität
            von {formatCents(planning.minLiquidityCents)}.
          </div>
        </div>
      )}

      <div className="card">
        <CashflowChart
          points={buckets.map((b) => ({
            label: b.label.split(" · ")[0],
            inflow: b.inflow,
            outflow: b.outflow,
            inflowRealized: b.inflowRealized,
            inflowPlanned: b.inflowPlanned,
            outflowRealized: b.outflowRealized,
            outflowPlanned: b.outflowPlanned,
            endLiquidity: b.endLiquidity,
            isFuture: b.index > 0,
            isCurrent: b.index === 0,
          }))}
          thresholdCents={planning.minLiquidityCents}
        />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left">Woche</th>
              <th className="px-3 py-2 text-right">Start</th>
              <th className="px-3 py-2 text-right">Einzahlungen</th>
              <th className="px-3 py-2 text-right">Auszahlungen</th>
              <th className="px-3 py-2 text-right">Netto</th>
              <th className="px-3 py-2 text-right">Ende</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.index} className={`border-b border-slate-50 ${b.belowThreshold ? "bg-amber-50" : ""}`}>
                <td className="px-3 py-1.5 font-medium text-slate-700">{b.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{formatCents(b.startLiquidity)}</td>
                <CellHover
                  query={{ cat: "all", dir: "in", from: b.startISO, to: b.endISO }}
                  title={`Einzahlungen · ${b.label}`}
                  className="px-3 py-1.5 text-right tabular-nums text-emerald-700"
                >
                  {b.inflow ? formatCents(b.inflow) : "–"}
                  {b.index === 0 && b.inflowRealized > 0 && (
                    <div className="text-xs font-normal text-slate-400">davon realisiert {formatCents(b.inflowRealized)}</div>
                  )}
                </CellHover>
                <CellHover
                  query={{ cat: "all", dir: "out", from: b.startISO, to: b.endISO }}
                  title={`Auszahlungen · ${b.label}`}
                  className="px-3 py-1.5 text-right tabular-nums text-red-600"
                >
                  {b.outflow ? formatCents(-b.outflow) : "–"}
                </CellHover>
                <td className={`px-3 py-1.5 text-right tabular-nums ${b.net < 0 ? "text-red-600" : "text-slate-700"}`}>{formatCents(b.net)}</td>
                <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${b.endLiquidity < 0 ? "text-red-600" : b.belowThreshold ? "text-amber-700" : "text-slate-900"}`}>
                  {formatCents(b.endLiquidity)}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Link href={`/drilldown?metric=range&from=${b.startISO}&to=${b.endISO}`} className="text-xs text-brand hover:underline">
                    Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Start + Netto = Ende (verankert am aktuellen Kontostand). Basis: gebuchte Salden + Planposten +
        offene Posten (fälligkeitsgenau); überfällige Forderungen werden auf die laufende Woche gezogen.
      </p>
    </div>
  );
}
