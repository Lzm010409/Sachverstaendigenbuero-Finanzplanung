import Link from "next/link";
import { prisma } from "@/lib/db";
import { getReceivablesReport, REMINDER_LABELS, suggestedReminderLevel } from "@/lib/receivables";
import { setReminderLevel } from "@/app/actions/openitems";
import { todayUTC } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { PageAlerts } from "@/components/page-alerts";

export const dynamic = "force-dynamic";

const REMINDER_STYLE = ["text-slate-400", "text-sky-600", "text-amber-600", "text-red-600"];

export default async function ReceivablesPage() {
  const today = todayUTC();
  const [report, items] = await Promise.all([
    getReceivablesReport(),
    prisma.openItem.findMany({
      where: { kind: "RECEIVABLE", paid: false },
      orderBy: { dueDate: "asc" },
    }),
  ]);
  const openOf = (i: { amount: number; paidAmount: number }) => Math.max(0, i.amount - i.paidAmount);
  const open = items.filter((i) => openOf(i) > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Forderungsmanagement</h1>
        <p className="text-sm text-slate-500">Alterstruktur, Zahlungsdauer (DSO) und Mahnstufen.</p>
      </div>

      <PageAlerts page="/receivables" />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-slate-500">Offene Forderungen</div>
          <div className="mt-1 text-2xl font-bold text-emerald-600">{formatCents(report.totalOpen)}</div>
          <div className="mt-1 text-xs text-slate-400">{report.count} Posten</div>
        </div>
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-slate-500">davon überfällig</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">{formatCents(report.overdueOpen)}</div>
        </div>
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-slate-500">Ø Zahlungsdauer (DSO)</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{report.dsoDays != null ? `${report.dsoDays} Tage` : "—"}</div>
          <div className="mt-1 text-xs text-slate-400">aus bezahlten Rechnungen</div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Alterstruktur</h2>
        <div className="grid gap-3 sm:grid-cols-5">
          {report.buckets.map((b) => (
            <div key={b.label} className="rounded-lg border border-slate-100 p-3">
              <div className="text-xs text-slate-500">{b.label}</div>
              <div className={`mt-1 text-lg font-bold ${b.minDays >= 61 ? "text-red-600" : b.minDays >= 1 ? "text-amber-600" : "text-slate-900"}`}>
                {formatCents(b.amount)}
              </div>
              <div className="text-xs text-slate-400">{b.count} Posten</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Offene Forderungen &amp; Mahnstufen</h2>
        {open.length === 0 ? (
          <p className="text-sm text-slate-400">Keine offenen Forderungen. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="th">Auftraggeber / Referenz</th>
                  <th className="th">Fällig</th>
                  <th className="th text-right">Offen</th>
                  <th className="th">Mahnstufe</th>
                </tr>
              </thead>
              <tbody>
                {open.map((i) => {
                  const daysOverdue = Math.floor((today.getTime() - new Date(i.dueDate).getTime()) / 86_400_000);
                  const suggest = suggestedReminderLevel(daysOverdue);
                  return (
                    <tr key={i.id} className="border-b border-slate-50">
                      <td className="td">
                        <div className="font-medium">{i.counterparty || "—"}</div>
                        {i.reference && <div className="text-xs text-slate-400">{i.reference}</div>}
                      </td>
                      <td className={`td whitespace-nowrap ${daysOverdue > 0 ? "font-semibold text-amber-600" : ""}`}>
                        {new Date(i.dueDate).toLocaleDateString("de-DE")}
                        {daysOverdue > 0 && <div className="text-xs">{daysOverdue} T überfällig</div>}
                      </td>
                      <td className="td text-right font-semibold text-emerald-600">{formatCents(openOf(i))}</td>
                      <td className="td">
                        <form action={setReminderLevel} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={i.id} />
                          <select name="level" defaultValue={String(i.reminderLevel)} className="input w-auto py-1 text-xs">
                            {REMINDER_LABELS.map((l, idx) => (
                              <option key={idx} value={idx}>{idx}. {l}</option>
                            ))}
                          </select>
                          <button className="btn-secondary px-2 py-1 text-xs">setzen</button>
                          {suggest > i.reminderLevel && (
                            <span className={`text-xs ${REMINDER_STYLE[suggest]}`} title="empfohlen">
                              → {suggest}. {REMINDER_LABELS[suggest]}
                            </span>
                          )}
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
        Vollständige Verwaltung (Teilzahlungen, bezahlt setzen) unter{" "}
        <Link href="/open-items" className="text-brand underline">Offene Posten</Link>.
      </p>
    </div>
  );
}
