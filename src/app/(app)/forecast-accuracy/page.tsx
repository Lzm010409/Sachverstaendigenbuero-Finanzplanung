import { getForecastAccuracy } from "@/lib/snapshots";
import { formatCents } from "@/lib/money";
import { SortableTh } from "@/components/sortable-th";
import { RecordSnapshotButton } from "./record-button";

export const dynamic = "force-dynamic";

export default async function ForecastAccuracyPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const rawRows = await getForecastAccuracy();

  // Sortierung (im Speicher). Standard: Reihenfolge aus getForecastAccuracy.
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const mul = dir === "asc" ? 1 : -1;
  const sortVal: Record<string, (r: (typeof rawRows)[number]) => number | string> = {
    targetMonth: (r) => r.targetMonth,
    horizonDays: (r) => r.horizonDays,
    projected: (r) => r.projected,
    actual: (r) => r.actual ?? Number.NEGATIVE_INFINITY,
    deviation: (r) => (r.deviation == null ? Number.NEGATIVE_INFINITY : Math.abs(r.deviation)),
  };
  const rows = sp.sort && sortVal[sp.sort]
    ? [...rawRows].sort((a, b) => {
        const va = sortVal[sp.sort!](a);
        const vb = sortVal[sp.sort!](b);
        return va < vb ? -1 * mul : va > vb ? 1 * mul : 0;
      })
    : rawRows;

  const evaluated = rows.filter((r) => r.actual != null);
  const mae =
    evaluated.length > 0
      ? Math.round(evaluated.reduce((s, r) => s + Math.abs(r.deviation ?? 0), 0) / evaluated.length)
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Prognose-Genauigkeit</h1>
        <p className="text-sm text-slate-500">
          Vergleich prognostizierter vs. tatsächlicher Liquidität. Die App hält monatliche Snapshots
          fest und trägt den Ist-Wert nach — die Auswertung wird mit der Zeit aussagekräftig.
        </p>
      </div>

      <div className="card">
        <RecordSnapshotButton />
        <p className="mt-2 text-xs text-slate-400">
          Idealerweise automatisch monatlich (Endpunkt/Trigger). Manuell hält der Button den aktuellen
          Stand fest.
        </p>
      </div>

      {mae != null && (
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-slate-500">Ø Prognosefehler (MAE)</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{formatCents(mae)}</div>
          <div className="mt-1 text-xs text-slate-400">über {evaluated.length} ausgewertete Snapshots</div>
        </div>
      )}

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine Snapshots. Halte den ersten oben fest.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <SortableTh col="targetMonth" label="Zielmonat" sort={sp.sort ?? ""} dir={dir} basePath="/forecast-accuracy" />
                <SortableTh col="horizonDays" label="Horizont" sort={sp.sort ?? ""} dir={dir} basePath="/forecast-accuracy" />
                <SortableTh col="projected" label="Prognose" sort={sp.sort ?? ""} dir={dir} basePath="/forecast-accuracy" align="right" />
                <SortableTh col="actual" label="Ist" sort={sp.sort ?? ""} dir={dir} basePath="/forecast-accuracy" align="right" />
                <SortableTh col="deviation" label="Abweichung" sort={sp.sort ?? ""} dir={dir} basePath="/forecast-accuracy" align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.targetMonth}-${r.horizonDays}`} className="border-b border-slate-50">
                  <td className="td font-medium">{r.targetMonth}</td>
                  <td className="td text-slate-500">{r.horizonDays} T</td>
                  <td className="td text-right tabular-nums">{formatCents(r.projected)}</td>
                  <td className="td text-right tabular-nums">{r.actual != null ? formatCents(r.actual) : <span className="text-slate-300">ausstehend</span>}</td>
                  <td className={`td text-right tabular-nums ${r.deviation == null ? "text-slate-300" : Math.abs(r.deviation) > 500000 ? "text-red-600" : "text-slate-600"}`}>
                    {r.deviation != null ? `${formatCents(r.deviation)}${r.deviationPct != null ? ` (${r.deviationPct}%)` : ""}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
