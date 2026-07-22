import { getConcentration } from "@/lib/concentration";
import { formatCents } from "@/lib/money";
import { PageAlerts } from "@/components/page-alerts";

export const dynamic = "force-dynamic";

function hhiLabel(hhi: number): { text: string; cls: string } {
  if (hhi < 1500) return { text: "gering", cls: "text-emerald-600" };
  if (hhi < 2500) return { text: "mäßig", cls: "text-amber-600" };
  return { text: "hoch", cls: "text-red-600" };
}

export default async function ConcentrationPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const months = Math.min(36, Math.max(3, Number(sp.m) || 12));
  const report = await getConcentration(months);
  const hhi = hhiLabel(report.hhi);
  const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Klumpenrisiko</h1>
          <p className="text-sm text-slate-500">Erlöskonzentration nach Auftraggeber (letzte {months} Monate)</p>
        </div>
        <form method="get">
          <select name="m" defaultValue={String(months)} className="input w-auto py-1 text-sm">
            <option value="6">6 Monate</option>
            <option value="12">12 Monate</option>
            <option value="24">24 Monate</option>
          </select>
          <button className="btn-secondary ml-2 px-3 py-1 text-sm">Anzeigen</button>
        </form>
      </div>

      <PageAlerts page="/concentration" />

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card"><div className="text-xs uppercase text-slate-500">Erlöse gesamt</div><div className="mt-1 text-xl font-bold">{formatCents(report.totalRevenue)}</div></div>
        <div className="card"><div className="text-xs uppercase text-slate-500">Top-1-Anteil</div><div className={`mt-1 text-xl font-bold ${report.top1Share > 0.3 ? "text-amber-600" : "text-slate-900"}`}>{pct(report.top1Share)}</div></div>
        <div className="card"><div className="text-xs uppercase text-slate-500">Top-3-Anteil</div><div className={`mt-1 text-xl font-bold ${report.top3Share > 0.6 ? "text-amber-600" : "text-slate-900"}`}>{pct(report.top3Share)}</div></div>
        <div className="card"><div className="text-xs uppercase text-slate-500">Konzentration (HHI)</div><div className={`mt-1 text-xl font-bold ${hhi.cls}`}>{report.hhi} · {hhi.text}</div></div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Top-Auftraggeber</h2>
        {report.debtors.length === 0 ? (
          <p className="text-sm text-slate-400">Keine Erlösdaten im Zeitraum.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="th">Auftraggeber</th>
                <th className="th text-right">Erlöse</th>
                <th className="th text-right">Anteil</th>
                <th className="th">Anteil (visuell)</th>
                <th className="th text-right">offene Forderung</th>
              </tr>
            </thead>
            <tbody>
              {report.debtors.map((d) => (
                <tr key={d.name} className="border-b border-slate-50">
                  <td className="td font-medium">{d.name}</td>
                  <td className="td text-right tabular-nums">{formatCents(d.revenue)}</td>
                  <td className="td text-right tabular-nums">{pct(d.share)}</td>
                  <td className="td">
                    <div className="h-2 w-full max-w-[160px] rounded bg-slate-100">
                      <div className="h-2 rounded bg-brand" style={{ width: `${Math.min(100, d.share * 100)}%` }} />
                    </div>
                  </td>
                  <td className="td text-right tabular-nums text-emerald-600">{d.openReceivable > 0 ? formatCents(d.openReceivable) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-slate-400">
        HHI = Summe der quadrierten Marktanteile (in %). &lt;1500 gering, 1500–2500 mäßig, &gt;2500 hohe
        Abhängigkeit von wenigen Auftraggebern.
      </p>
    </div>
  );
}
