import { getKpis, getCashflowMatrix } from "@/lib/analytics";
import { getReceivablesReport } from "@/lib/receivables";
import { getVatForecast } from "@/lib/tax";
import { todayUTC } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const [kpis, matrix, recv, vat] = await Promise.all([
    getKpis(),
    getCashflowMatrix(3, 3),
    getReceivablesReport(),
    getVatForecast(0, 2),
  ]);
  const today = todayUTC();
  const nextVat = vat.periods.find((p) => p.dueDate >= today && p.vatPayable > 0);

  const kpiRows = [
    ["Verfügbare Liquidität", formatCents(kpis.currentBalance)],
    ["Ø Einnahmen / Monat", formatCents(kpis.avgMonthlyIncome)],
    ["Ø Ausgaben / Monat", formatCents(-kpis.avgMonthlyExpense)],
    ["Netto / Monat", formatCents(kpis.netMonthly)],
    ["Reichweite", kpis.runwayMonths == null ? "∞" : `${kpis.runwayMonths} Monate`],
    ["Offene Forderungen", formatCents(kpis.openReceivables)],
    ["Offene Verbindlichkeiten", formatCents(kpis.openPayables)],
    ["Working Capital", formatCents(kpis.workingCapital)],
  ];

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Liquiditätsbericht</h1>
          <p className="text-sm text-slate-500">
            Gollenstede Sachverstand · Stand {today.toLocaleDateString("de-DE")}
          </p>
        </div>
        <PrintButton />
      </div>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Kennzahlen</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
          {kpiRows.map(([label, value]) => (
            <div key={label}>
              <div className="text-xs text-slate-500">{label}</div>
              <div className="text-lg font-bold text-slate-900">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-slate-600">Liquiditätsverlauf</h2>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="px-3 py-2 text-left">Monat</th>
              {matrix.months.map((m) => (
                <th key={m.key} className="px-3 py-2 text-right">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr><td className="px-3 py-1.5 text-slate-600">Liquidität Start</td>{matrix.months.map((m) => <td key={m.key} className="px-3 py-1.5 text-right tabular-nums">{formatCents(m.startLiquidity)}</td>)}</tr>
            <tr><td className="px-3 py-1.5 text-emerald-700">Einzahlungen</td>{matrix.months.map((m) => <td key={m.key} className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{formatCents(m.inflow)}</td>)}</tr>
            <tr><td className="px-3 py-1.5 text-red-600">Auszahlungen</td>{matrix.months.map((m) => <td key={m.key} className="px-3 py-1.5 text-right tabular-nums text-red-600">{formatCents(-m.outflow)}</td>)}</tr>
            <tr className="bg-slate-50 font-semibold"><td className="px-3 py-1.5">Liquidität Ende</td>{matrix.months.map((m) => <td key={m.key} className="px-3 py-1.5 text-right tabular-nums">{formatCents(m.endLiquidity)}</td>)}</tr>
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Forderungen (Aging)</h2>
          <table className="w-full text-sm">
            <tbody>
              {recv.buckets.map((b) => (
                <tr key={b.label} className="border-b border-slate-50">
                  <td className="py-1 text-slate-600">{b.label}</td>
                  <td className="py-1 text-right tabular-nums">{formatCents(b.amount)}</td>
                  <td className="py-1 text-right text-xs text-slate-400">{b.count}</td>
                </tr>
              ))}
              <tr className="font-semibold"><td className="py-1">Summe offen</td><td className="py-1 text-right tabular-nums">{formatCents(recv.totalOpen)}</td><td /></tr>
              <tr><td className="py-1 text-slate-500">Ø Zahlungsdauer</td><td className="py-1 text-right">{recv.dsoDays != null ? `${recv.dsoDays} Tage` : "—"}</td><td /></tr>
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Steuer-Vorschau (USt)</h2>
          {nextVat ? (
            <p className="text-sm text-slate-700">
              Nächste Zahllast: <strong>{formatCents(nextVat.vatPayable)}</strong> zum {nextVat.dueDate.toLocaleDateString("de-DE")} ({nextVat.label}).
            </p>
          ) : (
            <p className="text-sm text-slate-500">Keine offene USt-Zahllast erkannt.</p>
          )}
          <table className="mt-2 w-full text-sm">
            <tbody>
              {vat.periods.map((p) => (
                <tr key={p.label} className="border-b border-slate-50">
                  <td className="py-1 text-slate-600">{p.label}</td>
                  <td className="py-1 text-right tabular-nums">{formatCents(p.vatPayable)}</td>
                  <td className="py-1 text-right text-xs text-slate-400">{p.isEstimate ? "Schätzung" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <p className="text-xs text-slate-400 print:hidden">
        Tipp: Beim Drucken „Hintergrundgrafiken" aktivieren und als Ziel „Als PDF speichern" wählen.
      </p>
    </div>
  );
}
