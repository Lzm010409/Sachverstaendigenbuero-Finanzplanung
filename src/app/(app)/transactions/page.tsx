import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { GROUP_PREFIX } from "@/lib/category-tree";
import { formatCents } from "@/lib/money";
import { Pagination, clampPageSize } from "@/components/pagination";
import { PageAlerts } from "@/components/page-alerts";
import { TransactionsTable, type TxRow } from "./transactions-table";
import type { CatOpt } from "@/components/category-select";
import { FilterMemory, ClearFiltersLink, AutoFilterForm } from "@/components/filter-memory";
import { CategoryOptions, CategoryFilterOptions } from "@/components/category-select";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; state?: string; page?: string; q?: string; size?: string; cat?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = clampPageSize(sp.size);
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const sortMap: Record<string, Prisma.TransactionOrderByWithRelationInput> = {
    bookingDate: { bookingDate: dir },
    counterparty: { counterparty: dir },
    account: { account: { name: dir } },
    category: { category: { name: dir } },
    amount: { amount: dir },
  };
  // Umsätze archivierter Konten werden nicht mehr gelistet (sie zählen ohnehin
  // nicht in die Berechnungen). Endgültig entfernen: Konten-Seite.
  const where: Prisma.TransactionWhereInput = { account: { archived: false } };
  if (sp.account) where.accountId = sp.account;
  // Kategorie-Filter: "none" = nicht zugeordnet, sonst konkrete Kategorie-ID.
  if (sp.cat === "none" || sp.state === "uncategorized") where.categoryId = null;
  else if (sp.cat?.startsWith(GROUP_PREFIX)) {
    // Ganze Überkategorie: über alle zugehörigen Kindkategorien filtern.
    const kinder = await prisma.category.findMany({
      where: { parentId: sp.cat.slice(GROUP_PREFIX.length) },
      select: { id: true },
    });
    where.categoryId = { in: kinder.map((k) => k.id) };
  } else if (sp.cat) where.categoryId = sp.cat;
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
      orderBy: sp.sort && sortMap[sp.sort] ? [sortMap[sp.sort], { id: "desc" }] : [{ bookingDate: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { account: true, category: true },
    }),
    prisma.transaction.count({ where }),
    prisma.account.findMany({ where: { archived: false }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { deletedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
  ]);

  const pages = Math.ceil(totalCount / pageSize);
  const catOptions: CatOpt[] = categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, parentId: c.parentId, isGroup: c.isGroup }));
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

  const hasFilter = !!(sp.account || sp.state || sp.q || sp.cat);
  const sizeParam = pageSize !== 50 ? String(pageSize) : undefined;
  const filterParams = { account: sp.account, state: sp.state, q: sp.q, cat: sp.cat, size: sizeParam };
  const pageParams = { ...filterParams, sort: sp.sort, dir: sp.dir };

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
          <label className="label">Kategorie</label>
          <select name="cat" defaultValue={sp.cat ?? ""} className="input w-auto">
            <option value="">alle</option>
            <option value="none">nicht zugeordnet</option>
            <CategoryFilterOptions categories={catOptions} />
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
          <TransactionsTable
            transactions={rows}
            categories={catOptions}
            filterCategoryId={sp.cat === "none" || sp.state === "uncategorized" ? "none" : sp.cat || undefined}
            sort={sp.sort ?? ""}
            dir={dir}
            sortParams={filterParams}
          />
        )}

        <Pagination
          page={page}
          totalPages={pages}
          totalItems={totalCount}
          pageSize={pageSize}
          basePath="/transactions"
          params={pageParams}
        />
      </div>
    </div>
  );
}
