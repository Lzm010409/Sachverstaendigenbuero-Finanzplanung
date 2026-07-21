import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { todayUTC } from "@/lib/dates";
import { deleteOpenItem, setOpenItemPayment, toggleOpenItemPaid } from "@/app/actions/openitems";
import { OpenItemForm } from "./open-item-form";

export const dynamic = "force-dynamic";

function amountInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export default async function OpenItemsPage() {
  const [items, categories] = await Promise.all([
    prisma.openItem.findMany({
      orderBy: [{ paid: "asc" }, { dueDate: "asc" }],
      include: { category: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const today = todayUTC();
  const openOf = (i: { amount: number; paidAmount: number }) => Math.max(0, i.amount - i.paidAmount);
  const unpaid = items.filter((i) => !i.paid && openOf(i) > 0);
  const receivables = unpaid.filter((i) => i.kind === "RECEIVABLE").reduce((s, i) => s + openOf(i), 0);
  const payables = unpaid.filter((i) => i.kind === "PAYABLE").reduce((s, i) => s + openOf(i), 0);
  const overdue = unpaid.filter((i) => new Date(i.dueDate) < today);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Offene Posten</h1>
      <p className="-mt-4 text-sm text-slate-500">
        Der offene Restbetrag fließt bis zur Bezahlung zum Fälligkeitstag in die Liquiditätsvorschau
        ein. Teilzahlungen und Status lassen sich auch manuell pflegen; per sevDesk synchronisierte
        Posten werden beim nächsten Sync automatisch abgeglichen.
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
                  <th className="th text-right">Betrag / Offen</th>
                  <th className="th">Status</th>
                  <th className="th">Teilzahlung</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const open = openOf(i);
                  const isOverdue = !i.paid && open > 0 && new Date(i.dueDate) < today;
                  const partial = !i.paid && i.paidAmount > 0;
                  const status = i.paid
                    ? { label: "bezahlt", cls: "bg-slate-100 text-slate-500" }
                    : isOverdue
                      ? { label: "überfällig", cls: "bg-amber-100 text-amber-700" }
                      : partial
                        ? { label: "teilbezahlt", cls: "bg-sky-100 text-sky-700" }
                        : { label: "offen", cls: "bg-slate-100 text-slate-600" };
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
                        className={`td whitespace-nowrap text-right font-semibold ${i.kind === "RECEIVABLE" ? "text-emerald-600" : "text-red-600"}`}
                      >
                        {formatCents(i.kind === "RECEIVABLE" ? i.amount : -i.amount)}
                        {partial && (
                          <div className="text-xs font-normal text-slate-400">
                            offen: {formatCents(i.kind === "RECEIVABLE" ? open : -open)}
                          </div>
                        )}
                      </td>
                      <td className="td">
                        <span className={`badge ${status.cls}`}>{status.label}</span>
                      </td>
                      <td className="td">
                        <form action={setOpenItemPayment} className="flex items-center gap-1">
                          <input type="hidden" name="id" value={i.id} />
                          <input
                            name="paidAmount"
                            defaultValue={amountInput(i.paidAmount)}
                            inputMode="decimal"
                            className="input w-24 py-1 text-right text-xs"
                            aria-label="bezahlter Betrag"
                          />
                          <button className="btn-secondary px-2 py-1 text-xs" title="Teilzahlung speichern">
                            ✓
                          </button>
                        </form>
                      </td>
                      <td className="td">
                        <div className="flex justify-end gap-3">
                          <form action={toggleOpenItemPaid}>
                            <input type="hidden" name="id" value={i.id} />
                            <button className="text-xs text-slate-400 hover:text-brand">
                              {i.paid ? "offen setzen" : "voll bezahlt"}
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
