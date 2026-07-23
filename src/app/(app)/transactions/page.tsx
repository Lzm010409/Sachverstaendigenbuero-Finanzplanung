import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { Pagination, clampPageSize } from "@/components/pagination";
import { PageAlerts } from "@/components/page-alerts";
import { TransactionsTable, type TxRow } from "./transactions-table";
import type { CatOpt } from "@/components/category-select";
import { FilterMemory, ClearFiltersLink, AutoFilterForm } from "@/components/filter-memory";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; state?: string; page?: string; q?: string; size?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = clampPageSize(sp.size);
  // Umsätze archivierter Konten werden nicht mehr gelistet (sie zählen ohnehin
  // nicht in die Berechnungen). Endgültig entfernen: Konten-Seite.
  const where: Prisma.TransactionWhereInput = { account: { archived: false } };
  if (sp.account) where.accountId = sp.account;
  if (sp.state === "uncategorized") where.categoryId = null;
  if (sp.q) {
    where.OR = [
      { counterparty: { contains: sp.q, mode: "insensitive" } },
      { purpose: { contains: sp.q, mode: "insensitive" } },
    ];
  }

  const [transactions, totalCount, accounts, categories] = await Promise.all([
    prisma.transaction.findMany({
      where,
      // Stabiler Zweitschlüssel (id), damit Umsätze desselben Tages ihre
      // Reihenfolge über Neuladen/Kategorisieren behalten und nicht springen.
      orderBy: [{ bookingDate: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { account: true, category: true },
    }),
    prisma.transaction.count({ where }),
    prisma.account.findMany({ where: { archived: false }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { deletedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
  ]);

  const pages = Math.ceil(totalCount / pageSize);
  const catOptions: CatOpt[] = categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }));
  const rows: TxRow[] = transactions.map((t) => ({
    id: t.id,
    dateLabel: new Date(t.bookingDate).toLocaleDateString("de-DE"),
    counterparty: t.counterparty,
    purpose: t.purpose,
    accountName: t.account.name,
    categoryId: t.categoryId,
    amountLabel: formatCents(t.amount),
    negative: t.amount < 0,
  }));

  const hasFilter = !!(sp.account || sp.state || sp.q);

  return (
    <div className="space-y-6">
      <FilterMemory pageKey="/transactions" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Umsätze</h1>
        <span className="text-sm text-slate-500">{totalCount} Buchungen</span>
      </div>

      <PageAlerts page="/transactions" />

      <AutoFilterForm pageKey="/transactions" className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Konto</label>
          <select name="account" defaultValue={sp.account ?? ""} className="input w-auto">
            <option value="">alle</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select name="state" defaultValue={sp.state ?? ""} className="input w-auto">
            <option value="">alle</option>
            <option value="uncategorized">nicht zugeordnet</option>
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="label">Suche</label>
          <input name="q" defaultValue={sp.q ?? ""} className="input" placeholder="Zweck / Gegenpartei" />
        </div>
        {hasFilter && (
          <ClearFiltersLink pageKey="/transactions" basePath="/transactions" className="px-2 py-2 text-sm text-slate-400 hover:text-slate-600">
            zurücksetzen
          </ClearFiltersLink>
        )}
      </AutoFilterForm>

      <div className="card">
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-400">
            Keine Umsätze.{" "}
            <Link href="/import" className="text-brand underline">
              Jetzt importieren
            </Link>
            .
          </p>
        ) : (
          <TransactionsTable transactions={rows} categories={catOptions} />
        )}

        <Pagination
          page={page}
          totalPages={pages}
          totalItems={totalCount}
          pageSize={pageSize}
          basePath="/transactions"
          params={{ account: sp.account, state: sp.state, q: sp.q, size: pageSize !== 50 ? String(pageSize) : undefined }}
        />
      </div>
    </div>
  );
}
