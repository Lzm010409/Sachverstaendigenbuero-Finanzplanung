import Link from "next/link";
import { prisma } from "@/lib/db";
import { getWeeklyForecast, getPlanningSettings } from "@/lib/planning";
import { formatCents } from "@/lib/money";
import { ScenarioCompareChart, type CompareSeries } from "@/components/scenario-compare-chart";

export const dynamic = "force-dynamic";

const COLORS = ["#007FFF", "#11b07a", "#e6693a", "#7c3aed", "#f59e0b", "#0891b2"];
const WEEKS = 13;

export default async function ScenarioComparePage() {
  const [scenarios, planning] = await Promise.all([
    prisma.scenario.findMany({ orderBy: { name: "asc" } }),
    getPlanningSettings(),
  ]);

  // Basis + jedes Szenario als eigene Serie (wöchentliche End-Liquidität).
  const runs: { name: string; id?: string }[] = [{ name: "Basis" }, ...scenarios.map((s) => ({ name: s.name, id: s.id }))];
  const results = await Promise.all(runs.map((r) => getWeeklyForecast(WEEKS, r.id, planning.minLiquidityCents)));

  const labels = results[0].weeks.map((w) => w.label.split(" · ")[0]);
  const series: CompareSeries[] = runs.map((r, i) => ({
    name: r.name,
    color: COLORS[i % COLORS.length],
    values: results[i].weeks.map((w) => w.endLiquidity),
  }));

  // Endwerte + Tiefpunkte je Szenario für die Tabelle.
  const summary = runs.map((r, i) => {
    const weeks = results[i].weeks;
    const end = weeks[weeks.length - 1]?.endLiquidity ?? 0;
    const low = weeks.reduce((m, w) => Math.min(m, w.endLiquidity), Infinity);
    return { name: r.name, color: COLORS[i % COLORS.length], end, low };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Szenario-Vergleich</h1>
        <p className="text-sm text-slate-500">
          Wöchentliche Liquiditätsprognose ({WEEKS} Wochen) je Szenario im Vergleich. Szenarien pflegst du unter{" "}
          <Link href="/scenarios" className="text-brand underline">Szenarien</Link>.
        </p>
      </div>

      {scenarios.length === 0 && (
        <div className="card text-sm text-amber-700">
          Noch keine Szenarien angelegt — es wird nur die Basis gezeigt.{" "}
          <Link href="/scenarios" className="underline">Jetzt anlegen →</Link>
        </div>
      )}

      <div className="card">
        <ScenarioCompareChart labels={labels} series={series} thresholdCents={planning.minLiquidityCents} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <th className="th">Szenario</th>
              <th className="th text-right">Liquidität in {WEEKS} Wochen</th>
              <th className="th text-right">Tiefpunkt</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.name} className="border-b border-slate-50">
                <td className="td font-medium">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: s.color }} />
                  {s.name}
                </td>
                <td className={`td text-right font-semibold ${s.end < 0 ? "text-red-600" : "text-slate-900"}`}>{formatCents(s.end)}</td>
                <td className={`td text-right ${s.low < planning.minLiquidityCents ? "text-amber-600" : "text-slate-600"}`}>{formatCents(s.low)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
