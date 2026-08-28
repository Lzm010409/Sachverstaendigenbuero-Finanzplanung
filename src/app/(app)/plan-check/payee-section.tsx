import Link from "next/link";
import { detectRecurring } from "@/lib/recurring";
import { createPlannedFromSuggestion } from "@/app/actions/planning";
import { addDays, isoDate, todayUTC } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { SortableTh } from "@/components/sortable-th";

const REC_LABEL: Record<string, string> = {
  WEEKLY: "wöchentlich",
  MONTHLY: "monatlich",
  QUARTERLY: "vierteljährlich",
  YEARLY: "jährlich",
};

const REC_ORDER: Record<string, number> = { WEEKLY: 0, MONTHLY: 1, QUARTERLY: 2, YEARLY: 3 };

// „Nach Empfänger": automatisch erkannte regelmäßige Zahlungen (pro Gegenpartei,
// echter Rhythmus). Ergänzt den kategorienbasierten Plan-Check um präzise
// Cashflows für die Liquiditätsprognose.
export async function PayeeSection({ sort, dir }: { sort: string; dir: "asc" | "desc" }) {
  const raw = await detectRecurring();
  const today = todayUTC();

  // Sortierung (im Speicher). Standard: Reihenfolge aus detectRecurring.
  const mul = dir === "asc" ? 1 : -1;
  const sortVal: Record<string, (s: (typeof raw)[number]) => number | string> = {
    counterparty: (s) => s.counterparty.toLowerCase(),
    recurrence: (s) => REC_ORDER[s.recurrence] ?? 99,
    medianAmount: (s) => s.medianAmount,
    occurrences: (s) => s.occurrences,
    categoryName: (s) => (s.categoryName ?? "").toLowerCase(),
  };
  const suggestions = sort && sortVal[sort]
    ? [...raw].sort((a, b) => {
        const va = sortVal[sort](a);
        const vb = sortVal[sort](b);
        return va < vb ? -1 * mul : va > vb ? 1 * mul : 0;
      })
    : raw;
  const sortParams = { tab: "payees" };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Automatisch erkannte regelmäßige Zahlungen der letzten 12 Monate (je Gegenpartei, mit echtem
        Rhythmus). Übernimm sie als Planposten, damit die Vorschau vollständig ist.
      </p>
      <div className="card p-0">
        {suggestions.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">
            Keine neuen Wiederkehrer erkannt (oder bereits als Planposten vorhanden).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <SortableTh col="counterparty" label="Gegenpartei" sort={sort} dir={dir} basePath="/plan-check" params={sortParams} />
                  <SortableTh col="recurrence" label="Rhythmus" sort={sort} dir={dir} basePath="/plan-check" params={sortParams} />
                  <SortableTh col="medianAmount" label="Betrag (Median)" sort={sort} dir={dir} basePath="/plan-check" params={sortParams} align="right" />
                  <SortableTh col="occurrences" label="Vorkommen" sort={sort} dir={dir} basePath="/plan-check" params={sortParams} />
                  <SortableTh col="categoryName" label="Kategorie" sort={sort} dir={dir} basePath="/plan-check" params={sortParams} />
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s, idx) => {
                  const gap = { WEEKLY: 7, MONTHLY: 30, QUARTERLY: 91, YEARLY: 365 }[s.recurrence];
                  const next = addDays(new Date(s.lastDate + "T00:00:00Z"), gap);
                  const start = next.getTime() < today.getTime() ? today : next;
                  return (
                    <tr key={idx} className="border-b border-slate-50">
                      <td className="td font-medium">{s.counterparty}</td>
                      <td className="td">
                        {REC_LABEL[s.recurrence]}
                        <div className="text-xs text-slate-400">Ø {s.avgGapDays} Tage</div>
                      </td>
                      <td className={`td text-right font-semibold ${s.medianAmount < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {formatCents(s.medianAmount)}
                      </td>
                      <td className="td text-slate-500">{s.occurrences}×</td>
                      <td className="td text-xs text-slate-500">{s.categoryName ?? "—"}</td>
                      <td className="td text-right">
                        <form action={createPlannedFromSuggestion}>
                          <input type="hidden" name="name" value={s.counterparty} />
                          <input type="hidden" name="amount" value={s.medianAmount} />
                          <input type="hidden" name="recurrence" value={s.recurrence} />
                          <input type="hidden" name="categoryId" value={s.categoryId ?? ""} />
                          <input type="hidden" name="startDate" value={isoDate(start)} />
                          <button className="btn-secondary px-3 py-1 text-xs">als Planposten</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400">
        Übernommene Posten erscheinen unter <Link href="/planning" className="text-brand underline">Planung</Link> und
        fließen sofort in die Vorschau ein. Erkennung: ≥3 Vorkommen, stabiler Betrag (±30 %), regelmäßiger Abstand.
      </p>
    </div>
  );
}
