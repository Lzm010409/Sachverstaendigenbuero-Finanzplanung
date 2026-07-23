"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CategoryOptions, type CatOpt } from "@/components/category-select";

// Persistiert über die API-Route (fetch), damit KEINE Server-Action-Revalidierung
// die schwere Umsätze-Route bei jedem Klick neu rendert (verhindert 503 bei
// schnellem Kategorisieren).
async function persist(payload: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

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

export function TransactionsTable({
  transactions,
  categories,
  filterCategoryId,
}: {
  transactions: TxRow[];
  categories: CatOpt[];
  // Aktiver Kategorie-Filter: "none" = nicht zugeordnet, sonst Kategorie-ID;
  // undefined = kein Filter. Passt eine Zeile nach dem Kategorisieren nicht mehr,
  // wird sie lokal ausgeblendet (wie früher der Refresh, aber ohne Neuladen).
  filterCategoryId?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState<string>("");
  // Optimistische lokale Zustände: Kategorie-Overrides und gelöschte Zeilen.
  // So bleibt die Zuordnung sofort sichtbar OHNE die ganze Seite neu zu laden
  // (kein Refresh-Sturm -> keine 503-Fehler, kein Umsortieren).
  const [override, setOverride] = useState<Map<string, string | null>>(new Map());
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Bei echtem Datensatz-Wechsel (Navigation/Filter/Seite) lokale Zustände
  // zurücksetzen. Signatur = Zeilen-IDs; ändert sich nicht bei rein lokalen Edits.
  const sig = useMemo(() => transactions.map((t) => t.id).join(","), [transactions]);
  useEffect(() => {
    setOverride(new Map());
    setDeleted(new Set());
    setSelected(new Set());
    setHidden(new Set());
  }, [sig]);

  const matchesFilter = (catId: string | null) => {
    if (!filterCategoryId) return true;
    if (filterCategoryId === "none") return catId == null;
    return catId === filterCategoryId;
  };

  const rows = transactions.filter((t) => !deleted.has(t.id) && !hidden.has(t.id));
  const catOf = (t: TxRow) => (override.has(t.id) ? override.get(t.id)! : t.categoryId);

  const allOnPage = rows.length > 0 && rows.every((t) => selected.has(t.id));
  const someOnPage = rows.some((t) => selected.has(t.id));

  // Fehler beim Schreiben -> einmalig neu synchronisieren (statt still zu divergieren).
  const onError = () => router.refresh();

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      if (rows.every((t) => prev.has(t.id))) {
        const next = new Set(prev);
        for (const t of rows) next.delete(t.id);
        return next;
      }
      const next = new Set(prev);
      for (const t of rows) next.add(t.id);
      return next;
    });

  const applyBulk = () => {
    const ids = [...selected].filter((id) => !deleted.has(id));
    if (ids.length === 0) return;
    const cat = bulkCat || null;
    setOverride((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.set(id, cat);
      return next;
    });
    // Zeilen, die nicht mehr zum aktiven Filter passen, ausblenden.
    if (!matchesFilter(cat)) {
      setHidden((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
    }
    setSelected(new Set());
    void persist({ op: "categorize", ids, categoryId: cat }).then((ok) => {
      if (!ok) onError();
    });
  };

  const setOne = (id: string, categoryId: string) => {
    const val = categoryId || null;
    setOverride((prev) => new Map(prev).set(id, val));
    if (!matchesFilter(val)) setHidden((prev) => new Set(prev).add(id));
    void persist({ op: "categorize", ids: [id], categoryId: val }).then((ok) => {
      if (!ok) onError();
    });
  };

  const remove = (id: string) => {
    setDeleted((prev) => new Set(prev).add(id));
    void persist({ op: "delete", id }).then((ok) => {
      if (!ok) onError();
    });
  };

  const selectedCount = selected.size;

  return (
    <div>
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
          <button className="btn-primary px-3 py-1 text-sm" onClick={applyBulk}>
            Kategorie zuweisen
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
            {rows.map((t) => (
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
                    value={catOf(t) ?? ""}
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
