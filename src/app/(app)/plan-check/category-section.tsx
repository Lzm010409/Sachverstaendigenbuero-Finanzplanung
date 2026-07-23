import Link from "next/link";
import { getPlanReview } from "@/lib/plan-review";
import { PlanCheckRow } from "./plan-check-row";

// „Nach Kategorie": Ø-Ist der letzten 3 vollen Monate je Kategorie gegen den
// aktuellen Plan (Budget + Planposten), mit 1-Klick-Übernahme.
export async function CategorySection() {
  const { months, rows, hasData } = await getPlanReview();
  const income = rows.filter((r) => r.kind === "INCOME");
  const expense = rows.filter((r) => r.kind === "EXPENSE");
  const actionable = rows.filter((r) => r.status === "new" || r.status === "adjust").length;

  const Head = () => (
    <thead>
      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
        <th className="th">Kategorie</th>
        {months.map((m) => (
          <th key={m.key} className="th text-right">{m.label}</th>
        ))}
        <th className="th text-right">Ø Ist/M</th>
        <th className="th text-right">Plan/M</th>
        <th className="th text-right">Übernehmen als</th>
      </tr>
    </thead>
  );

  if (!hasData) {
    return (
      <div className="card">
        <p className="text-sm text-slate-400">Keine Umsätze im Auswertungszeitraum gefunden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Ø-Ist der letzten 3 vollen Monate ({months.map((m) => m.label).join(" · ")}) je Kategorie gegen den
        aktuellen Plan (Budget + Planposten). Betrag prüfen und als Budget oder Planposten übernehmen.
      </p>

      <div className="card flex flex-wrap items-center gap-4 text-sm">
        <span className="font-medium text-slate-700">{actionable}</span>
        <span className="text-slate-500">Vorschläge mit Handlungsbedarf (neu/anpassen)</span>
        <Link href="/budgets" className="ml-auto text-xs text-brand hover:underline">Budgets →</Link>
        <Link href="/planning" className="text-xs text-brand hover:underline">Planposten →</Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          {expense.length > 0 && (
            <>
              <Head />
              <tbody>
                <tr className="bg-slate-50">
                  <td className="td font-semibold text-slate-700" colSpan={months.length + 4}>Ausgaben</td>
                </tr>
                {expense.map((r) => (
                  <PlanCheckRow key={r.categoryId} row={r} />
                ))}
              </tbody>
            </>
          )}
          {income.length > 0 && (
            <tbody>
              <tr className="bg-slate-50">
                <td className="td font-semibold text-slate-700" colSpan={months.length + 4}>Einnahmen</td>
              </tr>
              {income.map((r) => (
                <PlanCheckRow key={r.categoryId} row={r} />
              ))}
            </tbody>
          )}
        </table>
      </div>

      <div className="space-y-1 text-xs text-slate-400">
        <p>
          <strong>Budget</strong> = Monats-Soll je Kategorie (Auswertung/Plan-Ist). <strong>Planposten</strong> =
          wiederkehrender Cashflow, der zusätzlich in die Liquiditätsprognose einfließt.
        </p>
        <p>
          Idempotent: Existiert schon ein Budget bzw. Planposten für die Kategorie, wird dessen Betrag
          aktualisiert (nicht verdoppelt). „Plan/M" zeigt den aktuellen Stand (B = Budget, P = Planposten).
        </p>
        <p>
          Bei unregelmäßigen Posten (z. B. Quartals-/Jahreszahlungen) täuscht der 3-Monats-Schnitt – die drei
          Monatsspalten zeigen die Verteilung. Betrag ggf. vor dem Übernehmen anpassen. Für den echten Zahlungs­takt
          siehe Tab <strong>Nach Empfänger</strong>.
        </p>
      </div>
    </div>
  );
}
