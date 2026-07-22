import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { todayUTC } from "@/lib/dates";
import { deleteOpenItem, setOpenItemPayment, toggleOpenItemPaid } from "@/app/actions/openitems";
import { OpenItemForm } from "./open-item-form";
import { Pagination } from "@/components/pagination";
import { PageAlerts } from "@/components/page-alerts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function amountInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export default async function OpenItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const today = todayUTC();

  // Filter -> Prisma-Where
  const where: Prisma.OpenItemWhereInput = {};
  if (sp.kind === "RECEIVABLE" || sp.kind === "PAYABLE") where.kind = sp.kind;
  if (sp.status === "paid") where.paid = true;
  else if (sp.status === "open") where.paid = false;
  else if (sp.status === "overdue") {
    where.paid = false;
    where.dueDate = { lt: today };
  } else if (sp.status === "partial") {
    where.paid = false;
    where.paidAmount = { gt: 0 };
  }
  if (sp.q) {
    where.OR = [
      { counterparty: { contains: sp.q, mode: "insensitive" } },
      { reference: { contains: sp.q, mode: "insensitive" } },
    ];
  }

  const openOf = (i: { amount: number; paidAmount: number }) => Math.max(0, i.amount - i.paidAmount);

  const [items, matchCount, categories, unpaidAll] = await Promise.all([
    prisma.openItem.findMany({
      where,
      orderBy: [{ paid: "asc" }, { dueDate: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { category: true },
    }),
    prisma.openItem.count({ where }),
    prisma.category.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    // Für die Kennzahlen: alle offenen Posten (unabhängig vom Filter).
    prisma.openItem.findMany({
      where: { paid: false },
      select: { kind: true, amount: true, paidAmount: true, dueDate: true },
    }),
  ]);
  const totalPages = Math.ceil(matchCount / PAGE_SIZE);

  const unpaid = unpaidAll.filter((i) => openOf(i) > 0);
  const receivables = unpaid.filter((i) => i.kind === "RECEIVABLE").reduce((s, i) => s + openOf(i), 0);
  const payables = unpaid.filter((i) => i.kind === "PAYABLE").reduce((s, i) => s + openOf(i), 0);
  const overdueCount = unpaid.filter((i) => new Date(i.dueDate) < today).length;

  const filterParams = { kind: sp.kind, status: sp.status, q: sp.q };

  // KPI-Karten sind Drilldowns: sie setzen den passenden Tabellenfilter.
  const kpi = (href: string, active: boolean, label: string, value: string, tone: string) => (
    <Link
      href={href}
      className={`card block transition hover:ring-2 hover:ring-brand/30 ${active ? "ring-2 ring-brand/40" : ""}`}
    >
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
      <div className="mt-1 text-xs text-brand">Details anzeigen →</div>
    </Link>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Offene Posten</h1>
      <p className="-mt-4 text-sm text-slate-500">
        Der offene Restbetrag fließt bis zur Bezahlung zum Fälligkeitstag in die Liquiditätsvorschau
        ein. Teilzahlungen und Status lassen sich auch manuell pflegen; per sevDesk synchronisierte
        Posten werden beim nächsten Sync automatisch abgeglichen.
      </p>

      <PageAlerts page="/open-items" />

      <div className="grid gap-4 sm:grid-cols-3">
        {kpi("/open-items?kind=RECEIVABLE", sp.kind === "RECEIVABLE", "Offene Forderungen", formatCents(receivables), "text-emerald-600")}
        {kpi("/open-items?kind=PAYABLE", sp.kind === "PAYABLE", "Offene Verbindlichkeiten", formatCents(payables), "text-red-600")}
        {kpi("/open-items?status=overdue", sp.status === "overdue", "Überfällig", String(overdueCount), "text-amber-600")}
      </div>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Neuer Posten</h2>
        <OpenItemForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Alle Posten</h2>
          <form className="flex flex-wrap items-end gap-2" method="get">
            <select name="kind" defaultValue={sp.kind ?? ""} className="input w-auto py-1 text-sm">
              <option value="">Art: alle</option>
              <option value="RECEIVABLE">Forderungen</option>
              <option value="PAYABLE">Verbindlichkeiten</option>
            </select>
            <select name="status" defaultValue={sp.status ?? ""} className="input w-auto py-1 text-sm">
              <option value="">Status: alle</option>
              <option value="open">offen</option>
              <option value="overdue">überfällig</option>
              <option value="partial">teilbezahlt</option>
              <option value="paid">bezahlt</option>
            </select>
            <input name="q" defaultValue={sp.q ?? ""} className="input w-40 py-1 text-sm" placeholder="Gegenpartei / Ref." />
            <button className="btn-secondary px-3 py-1 text-sm" type="submit">
              Filtern
            </button>
            {(sp.kind || sp.status || sp.q) && (
              <Link href="/open-items" className="px-2 py-1 text-sm text-slate-400 hover:text-slate-600">
                zurücksetzen
              </Link>
            )}
          </form>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-slate-400">Keine Posten für diesen Filter.</p>
        ) : (
          <>
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
            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={matchCount}
              pageSize={PAGE_SIZE}
              basePath="/open-items"
              params={filterParams}
            />
          </>
        )}
      </div>
    </div>
  );
}
