import Link from "next/link";
import { getPlanVsActual } from "@/lib/queries";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function PlanActualPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const monthOffset = Math.min(0, Math.max(-24, Number(sp.m) || 0));
  const { monthStart, rows } = await getPlanVsActual(monthOffset);

  const monthLabel = monthStart.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const totalPlanned = rows.reduce((s, r) => s + r.planned, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plan / Ist</h1>
          <p className="text-sm text-slate-500">Geplante gegen gebuchte Werte je Kategorie</p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="btn-secondary" href={`/plan-actual?m=${monthOffset - 1}`}>
            ← Vormonat
          </Link>
          <span className="min-w-[9rem] text-center text-sm font-medium">{monthLabel}</span>
          <Link
            className={`btn-secondary ${monthOffset >= 0 ? "pointer-events-none opacity-40" : ""}`}
            href={`/plan-actual?m=${Math.min(0, monthOffset + 1)}`}
          >
            Folgemonat →
          </Link>
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">
            Keine Daten für diesen Monat. Lege Planposten mit Kategorie an und importiere Umsätze.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="th">Kategorie</th>
                  <th className="th text-right">Plan</th>
                  <th className="th text-right">Ist</th>
                  <th className="th text-right">Abweichung</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const diff = r.actual - r.planned;
                  return (
                    <tr key={r.categoryId ?? "none"} className="border-b border-slate-50">
                      <td className="td font-medium">{r.categoryName}</td>
                      <td className="td text-right">{formatCents(r.planned)}</td>
                      <td className="td text-right">{formatCents(r.actual)}</td>
                      <td
                        className={`td text-right font-semibold ${diff < 0 ? "text-red-600" : "text-emerald-600"}`}
                      >
                        {diff > 0 ? "+" : ""}
                        {formatCents(diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold">
                  <td className="td">Summe</td>
                  <td className="td text-right">{formatCents(totalPlanned)}</td>
                  <td className="td text-right">{formatCents(totalActual)}</td>
                  <td
                    className={`td text-right ${totalActual - totalPlanned < 0 ? "text-red-600" : "text-emerald-600"}`}
                  >
                    {totalActual - totalPlanned > 0 ? "+" : ""}
                    {formatCents(totalActual - totalPlanned)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400">
        Hinweis: „Ist" basiert auf den gebuchten Umsätzen des Monats. „Plan" nimmt je Kategorie
        <strong> das Budget</strong> als Soll (Monatsbetrag = Jahreswert/12, sofern in diesem Monat
        gültig); nur wo <strong>kein Budget</strong> hinterlegt ist, greift der aktive
        <strong> Planposten</strong> der Kategorie. So zählt je Kategorie genau eine Plan-Quelle
        (keine Doppelung). Das Vorzeichen folgt dem Betrag (Ausgaben negativ).
      </p>
    </div>
  );
}
