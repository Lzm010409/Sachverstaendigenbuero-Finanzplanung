import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { todayUTC } from "@/lib/dates";
import { deleteOpenItem, toggleOpenItemPaid } from "@/app/actions/openitems";
import { OpenItemForm } from "./open-item-form";

export const dynamic = "force-dynamic";

export default async function OpenItemsPage() {
  const [items, categories] = await Promise.all([
    prisma.openItem.findMany({
      orderBy: [{ paid: "asc" }, { dueDate: "asc" }],
      include: { category: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const today = todayUTC();
  const open = items.filter((i) => !i.paid);
  const receivables = open
    .filter((i) => i.kind === "RECEIVABLE")
    .reduce((s, i) => s + i.amount, 0);
  const payables = open.filter((i) => i.kind === "PAYABLE").reduce((s, i) => s + i.amount, 0);
  const overdue = open.filter((i) => new Date(i.dueDate) < today);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Offene Posten</h1>
      <p className="-mt-4 text-sm text-slate-500">
        Unbezahlte Forderungen und Verbindlichkeiten fließen bis zur Bezahlung zum Fälligkeitstag
        in die Liquiditätsvorschau ein.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-slate-500">Offene Forderungen</div>
          <div className="mt-1 text-2xl font-bold text-emerald-600">{formatCents(receivables)}</div>
        </div>
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-slate-500">Offene Verbindlichkeiten</div>
          <div className="mt-1 text-2xl font-bold text-red-600">{formatCents(payables)}</div>
        </div>
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-slate-500">Überfällig</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">{overdue.length}</div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Neuer Posten</h2>
        <OpenItemForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Alle Posten</h2>
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine offenen Posten.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="th">Art</th>
                  <th className="th">Gegenpartei / Referenz</th>
                  <th className="th">Fällig</th>
                  <th className="th text-right">Betrag</th>
                  <th className="th">Status</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const isOverdue = !i.paid && new Date(i.dueDate) < today;
                  return (
                    <tr key={i.id} className={`border-b border-slate-50 ${i.paid ? "opacity-50" : ""}`}>
                      <td className="td">
                        <span
                          className={`badge ${i.kind === "RECEIVABLE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
                        >
                          {i.kind === "RECEIVABLE" ? "Forderung" : "Verbindlichkeit"}
                        </span>
                      </td>
                      <td className="td">
                        <div className="font-medium">{i.counterparty || "—"}</div>
                        {i.reference && <div className="text-xs text-slate-400">{i.reference}</div>}
                      </td>
                      <td className={`td whitespace-nowrap ${isOverdue ? "font-semibold text-amber-600" : ""}`}>
                        {new Date(i.dueDate).toLocaleDateString("de-DE")}
                        {isOverdue && " ⚠"}
                      </td>
                      <td
                        className={`td text-right font-semibold ${i.kind === "RECEIVABLE" ? "text-emerald-600" : "text-red-600"}`}
                      >
                        {formatCents(i.kind === "RECEIVABLE" ? i.amount : -i.amount)}
                      </td>
                      <td className="td">
                        {i.paid ? (
                          <span className="text-xs text-slate-400">
                            bezahlt{i.paidDate ? ` ${new Date(i.paidDate).toLocaleDateString("de-DE")}` : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">offen</span>
                        )}
                      </td>
                      <td className="td">
                        <div className="flex justify-end gap-3">
                          <form action={toggleOpenItemPaid}>
                            <input type="hidden" name="id" value={i.id} />
                            <button className="text-xs text-slate-400 hover:text-brand">
                              {i.paid ? "offen setzen" : "bezahlt"}
                            </button>
                          </form>
                          <form action={deleteOpenItem}>
                            <input type="hidden" name="id" value={i.id} />
                            <button className="text-xs text-slate-400 hover:text-red-600">löschen</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
