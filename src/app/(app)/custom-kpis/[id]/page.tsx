import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomKpiDef, getCustomKpiTransactions } from "@/lib/custom-kpi";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

const deDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("de-DE");

export default async function CustomKpiDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const def = await getCustomKpiDef(id);
  if (!def) notFound();
  const { txs, total, count, from, to, unit, metricLabel, rangeLabel } = await getCustomKpiTransactions(def);
  const totalStr = unit === "count" ? count.toLocaleString("de-DE") : formatCents(total);
  const rangeStr = `${from.toLocaleDateString("de-DE")} – ${new Date(to.getTime() - 86_400_000).toLocaleDateString("de-DE")}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{def.name}</h1>
          <p className="text-sm text-slate-500">{metricLabel} · {rangeLabel} ({rangeStr})</p>
        </div>
        <Link href="/custom-kpis" className="btn-secondary">← zurück</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card"><div className="text-xs uppercase tracking-wide text-slate-500">Wert ({metricLabel})</div><div className="mt-1 text-2xl font-bold text-slate-900">{totalStr}</div></div>
        <div className="card"><div className="text-xs uppercase tracking-wide text-slate-500">Anzahl Buchungen</div><div className="mt-1 text-2xl font-bold text-slate-900">{count.toLocaleString("de-DE")}</div></div>
        <div className="card"><div className="text-xs uppercase tracking-wide text-slate-500">Zeitraum</div><div className="mt-1 text-sm font-medium text-slate-700">{rangeStr}</div></div>
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="px-4 pt-4 text-sm font-semibold text-slate-700">Genutzte Transaktionen</h2>
        {txs.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">Keine Transaktionen im Zeitraum/Filter.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="th">Datum</th>
                <th className="th">Gegenpartei / Zweck</th>
                <th className="th">Kategorie</th>
                <th className="th text-right">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id} className="border-b border-slate-50">
                  <td className="td whitespace-nowrap">{deDate(t.date)}</td>
                  <td className="td">
                    <div className="font-medium text-slate-800">{t.counterparty || "—"}</div>
                    {t.purpose && <div className="truncate text-xs text-slate-400">{t.purpose}</div>}
                  </td>
                  <td className="td text-slate-500">{t.categoryName ?? "—"}</td>
                  <td className={`td whitespace-nowrap text-right font-semibold tabular-nums ${t.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {formatCents(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            {unit !== "count" && (
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold">
                  <td className="td" colSpan={3}>Summe ({metricLabel})</td>
                  <td className="td text-right tabular-nums">{formatCents(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
