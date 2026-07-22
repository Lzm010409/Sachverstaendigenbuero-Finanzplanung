"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkSetTransactionCategory, deleteTransaction, setTransactionCategory } from "@/app/actions/transactions";
import { CategoryOptions, type CatOpt } from "@/components/category-select";

export interface TxRow {
  id: string;
  dateLabel: string;
  counterparty: string;
  purpose: string;
  accountName: string;
  categoryId: string | null;
  amountLabel: string;
  negative: boolean;
}

export function TransactionsTable({ transactions, categories }: { transactions: TxRow[]; categories: CatOpt[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState<string>("");
  const [pending, start] = useTransition();

  const allOnPage = transactions.length > 0 && transactions.every((t) => selected.has(t.id));
  const someOnPage = transactions.some((t) => selected.has(t.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      if (transactions.every((t) => prev.has(t.id))) {
        const next = new Set(prev);
        for (const t of transactions) next.delete(t.id);
        return next;
      }
      const next = new Set(prev);
      for (const t of transactions) next.add(t.id);
      return next;
    });

  const applyBulk = () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    start(async () => {
      await bulkSetTransactionCategory(ids, bulkCat || null);
      setSelected(new Set());
      router.refresh();
    });
  };

  const setOne = (id: string, categoryId: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("categoryId", categoryId);
      await setTransactionCategory(fd);
      router.refresh();
    });

  const remove = (id: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set("id", id);
      await deleteTransaction(fd);
      router.refresh();
    });

  const selectedCount = useMemo(() => selected.size, [selected]);

  return (
    <div>
      {/* Sammel-Aktionsleiste – erscheint, sobald etwas ausgewählt ist. */}
      {selectedCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-brand/30 bg-brand/5 px-3 py-2">
          <span className="text-sm font-medium text-slate-700">{selectedCount} ausgewählt</span>
          <select
            value={bulkCat}
            onChange={(e) => setBulkCat(e.target.value)}
            className="input w-auto py-1 text-sm"
            aria-label="Zielkategorie"
          >
            <option value="">– nicht zugeordnet –</option>
            <CategoryOptions categories={categories} />
          </select>
          <button className="btn-primary px-3 py-1 text-sm" disabled={pending} onClick={applyBulk}>
            {pending ? "…" : "Kategorie zuweisen"}
          </button>
          <button className="btn-secondary px-3 py-1 text-sm" onClick={() => setSelected(new Set())}>
            Auswahl aufheben
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="th w-8">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  ref={(el) => {
                    if (el) el.indeterminate = someOnPage && !allOnPage;
                  }}
                  onChange={toggleAll}
                  aria-label="Alle auf dieser Seite auswählen"
                  className="h-4 w-4 rounded border-slate-300"
                />
              </th>
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
              <tr key={t.id} className={`border-b border-slate-50 align-top ${selected.has(t.id) ? "bg-brand/5" : ""}`}>
                <td className="td">
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                    aria-label="Umsatz auswählen"
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </td>
                <td className="td whitespace-nowrap">{t.dateLabel}</td>
                <td className="td max-w-sm">
                  <div className="font-medium text-slate-800">{t.counterparty || "—"}</div>
                  <div className="truncate text-xs text-slate-400">{t.purpose}</div>
                </td>
                <td className="td whitespace-nowrap text-xs text-slate-500">{t.accountName}</td>
                <td className="td">
                  <select
                    value={t.categoryId ?? ""}
                    disabled={pending}
                    className="input py-1 text-xs"
                    onChange={(e) => setOne(t.id, e.target.value)}
                  >
                    <option value="">– nicht zugeordnet –</option>
                    <CategoryOptions categories={categories} />
                  </select>
                </td>
                <td className={`td whitespace-nowrap text-right font-semibold ${t.negative ? "text-red-600" : "text-emerald-600"}`}>
                  {t.amountLabel}
                </td>
                <td className="td text-right">
                  <button
                    className="text-xs text-slate-300 hover:text-red-600"
                    disabled={pending}
                    onClick={() => remove(t.id)}
                    aria-label="Umsatz löschen"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
