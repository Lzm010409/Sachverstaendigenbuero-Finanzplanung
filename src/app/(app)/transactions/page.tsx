import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { deleteTransaction } from "@/app/actions/transactions";
import { TxCategorySelect } from "./tx-category-select";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; state?: string; page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.TransactionWhereInput = {};
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
      orderBy: { bookingDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { account: true, category: true },
    }),
    prisma.transaction.count({ where }),
    prisma.account.findMany({ where: { archived: false }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const pages = Math.ceil(totalCount / PAGE_SIZE);
  const catOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  const qs = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { account: sp.account, state: sp.state, q: sp.q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Umsätze</h1>
        <span className="text-sm text-slate-500">{totalCount} Buchungen</span>
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="get">
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
        <button className="btn-secondary" type="submit">
          Filtern
        </button>
      </form>

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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="th">Datum</th>
                  <th className="th">Gegenpartei / Zweck</th>
                  <th className="th">Konto</th>
                  <th className="th">Kategorie</th>
                  <th className="th text-right">Betrag</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-slate-50 align-top">
                    <td className="td whitespace-nowrap">
                      {new Date(t.bookingDate).toLocaleDateString("de-DE")}
                    </td>
                    <td className="td max-w-sm">
                      <div className="font-medium text-slate-800">{t.counterparty || "—"}</div>
                      <div className="truncate text-xs text-slate-400">{t.purpose}</div>
                    </td>
                    <td className="td whitespace-nowrap text-xs text-slate-500">{t.account.name}</td>
                    <td className="td">
                      <TxCategorySelect txId={t.id} current={t.categoryId} categories={catOptions} />
                    </td>
                    <td
                      className={`td whitespace-nowrap text-right font-semibold ${t.amount < 0 ? "text-red-600" : "text-emerald-600"}`}
                    >
                      {formatCents(t.amount)}
                    </td>
                    <td className="td text-right">
                      <form action={deleteTransaction}>
                        <input type="hidden" name="id" value={t.id} />
                        <button className="text-xs text-slate-300 hover:text-red-600">×</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-slate-500">
              Seite {page} / {pages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link className="btn-secondary" href={qs({ page: String(page - 1) })}>
                  ← Zurück
                </Link>
              )}
              {page < pages && (
                <Link className="btn-secondary" href={qs({ page: String(page + 1) })}>
                  Weiter →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
