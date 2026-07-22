import Link from "next/link";
import { getVatForecast } from "@/lib/tax";
import { todayUTC } from "@/lib/dates";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function TaxPage() {
  const { ratePercent, cycle, source, periods } = await getVatForecast(3, 3);
  const today = todayUTC();
  const upcoming = periods.filter((p) => p.dueDate >= today && p.vatPayable > 0);
  const nextDue = upcoming[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Steuer-/USt-Vorschau</h1>
        <p className="text-sm text-slate-500">
          Umsatzsteuer-Zahllast je {cycle === "monthly" ? "Monat" : "Quartal"} ·{" "}
          {source === "sevdesk" ? (
            <span className="text-emerald-600">aus sevDesk (nur EUR-Belege/Rechnungen mit MwSt &gt; 0)</span>
          ) : (
            <span className="text-amber-600">geschätzt aus Umsätzen ({String(ratePercent).replace(".", ",")} %)</span>
          )}{" "}
          · Zyklus unter <Link href="/settings" className="text-brand underline">Einstellungen</Link>.
        </p>
      </div>

      {nextDue && (
        <div className="card flex items-start gap-3 border-amber-200 bg-amber-50 text-sm text-amber-800">
          <span className="text-xl">🧾</span>
          <div>
            <strong>Nächste USt-Zahllast:</strong> {formatCents(nextDue.vatPayable)} fällig zum{" "}
            {nextDue.dueDate.toLocaleDateString("de-DE")} ({nextDue.label}).
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left">Zeitraum</th>
              <th className="px-3 py-2 text-left">Fällig</th>
              <th className="px-3 py-2 text-right">USt auf Erlöse</th>
              <th className="px-3 py-2 text-right">Vorsteuer</th>
              <th className="px-3 py-2 text-right">Zahllast</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.label} className={`border-b border-slate-50 ${p.isEstimate ? "bg-slate-50/50" : ""}`}>
                <td className="px-3 py-1.5 font-medium text-slate-700">{p.label}</td>
                <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">{p.dueDate.toLocaleDateString("de-DE")}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{formatCents(p.vatOnRevenue)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{formatCents(p.vatOnCost)}</td>
                <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${p.vatPayable < 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCents(p.vatPayable)}
                </td>
                <td className="px-3 py-1.5">
                  {p.paid ? (
                    <span className="badge bg-slate-100 text-slate-500">abgeschlossen</span>
                  ) : p.isEstimate ? (
                    <span className="badge bg-sky-100 text-sky-700">Schätzung</span>
                  ) : (
                    <span className="badge bg-amber-100 text-amber-700">offen</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        {source === "sevdesk"
          ? "Basis: tatsächliche Steuerbeträge (sumTax) der Rechnungen (USt) und Belege (Vorsteuer) aus sevDesk, ausschließlich in EUR und mit MwSt > 0, nach Beleg-/Rechnungsdatum. Soll-Versteuerung; §13b und Sonderfälle unberücksichtigt — als Orientierung, nicht als Steuererklärung."
          : "Kein sevDesk-Token: vereinfachte Schätzung aus den gebuchten Umsätzen (Brutto → Netto bei einheitlichem Satz)."}
      </p>
    </div>
  );
}
