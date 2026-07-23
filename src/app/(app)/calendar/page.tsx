import { getPaymentCalendar } from "@/lib/calendar";
import { formatCents } from "@/lib/money";
import { FilterMemory, AutoFilterForm } from "@/components/filter-memory";

export const dynamic = "force-dynamic";

const TYPE_STYLE = {
  receivable: "bg-emerald-100 text-emerald-700",
  payable: "bg-red-100 text-red-700",
  planned: "bg-slate-100 text-slate-600",
} as const;
const TYPE_LABEL = { receivable: "Forderung", payable: "Verbindlichkeit", planned: "Planposten" } as const;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const sp = await searchParams;
  const days = Math.min(120, Math.max(14, Number(sp.d) || 56));
  const cal = await getPaymentCalendar(days);

  return (
    <div className="space-y-6">
      <FilterMemory pageKey="/calendar" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fälligkeitskalender</h1>
          <p className="text-sm text-slate-500">Ein- und ausgehende Zahlungen nach Datum (nächste {days} Tage)</p>
        </div>
        <AutoFilterForm pageKey="/calendar">
          <select name="d" defaultValue={String(days)} className="input w-auto py-1 text-sm">
            <option value="28">4 Wochen</option>
            <option value="56">8 Wochen</option>
            <option value="90">3 Monate</option>
            <option value="120">4 Monate</option>
          </select>
        </AutoFilterForm>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card"><div className="text-xs uppercase text-slate-500">Erwartete Einzahlungen</div><div className="mt-1 text-xl font-bold text-emerald-600">{formatCents(cal.totalIn)}</div></div>
        <div className="card"><div className="text-xs uppercase text-slate-500">Erwartete Auszahlungen</div><div className="mt-1 text-xl font-bold text-red-600">{formatCents(-cal.totalOut)}</div></div>
        <div className="card"><div className="text-xs uppercase text-slate-500">Saldo im Zeitraum</div><div className={`mt-1 text-xl font-bold ${cal.totalIn - cal.totalOut < 0 ? "text-red-600" : "text-slate-900"}`}>{formatCents(cal.totalIn - cal.totalOut)}</div></div>
      </div>

      {cal.days.length === 0 ? (
        <div className="card text-sm text-slate-400">Keine terminierten Zahlungen im Zeitraum.</div>
      ) : (
        <div className="space-y-3">
          {cal.days.map((d) => (
            <div key={d.date} className="card">
              <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="font-semibold text-slate-800">
                  {d.weekday}, {new Date(d.date).toLocaleDateString("de-DE")}
                </div>
                <div className="text-sm tabular-nums">
                  {d.inflow > 0 && <span className="mr-3 text-emerald-600">+{formatCents(d.inflow)}</span>}
                  {d.outflow > 0 && <span className="text-red-600">−{formatCents(d.outflow)}</span>}
                </div>
              </div>
              <ul className="space-y-1">
                {d.events.map((e, idx) => (
                  <li key={idx} className="flex items-start justify-between gap-3 text-sm">
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={`badge shrink-0 ${TYPE_STYLE[e.type]}`}>{TYPE_LABEL[e.type]}</span>
                      <span className="break-words text-slate-700">{e.label}</span>
                      {e.reference && <span className="break-words text-xs text-slate-400">{e.reference}</span>}
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${e.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {formatCents(e.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
