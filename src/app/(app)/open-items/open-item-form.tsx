"use client";

import { useActionState, useEffect, useRef } from "react";
import { createOpenItem } from "@/app/actions/openitems";
import { CategoryOptions, type CatOpt } from "@/components/category-select";

export function OpenItemForm({ categories }: { categories: CatOpt[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (_p: { error?: string; ok?: boolean }, fd: FormData) => createOpenItem(fd),
    {},
  );
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <label className="label">Art</label>
        <select name="kind" className="input" defaultValue="RECEIVABLE">
          <option value="RECEIVABLE">Forderung (wir erhalten)</option>
          <option value="PAYABLE">Verbindlichkeit (wir zahlen)</option>
        </select>
      </div>
      <div>
        <label className="label">Gegenpartei</label>
        <input name="counterparty" className="input" placeholder="Kunde / Lieferant" />
      </div>
      <div>
        <label className="label">Referenz / Rechnungs-Nr.</label>
        <input name="reference" className="input" placeholder="RE-2026-…" />
      </div>
      <div>
        <label className="label">Betrag (€, brutto)</label>
        <input name="amount" className="input" placeholder="1.190,00" inputMode="decimal" required />
      </div>
      <div>
        <label className="label">Rechnungsdatum</label>
        <input name="issueDate" type="date" className="input" />
      </div>
      <div>
        <label className="label">Fällig am</label>
        <input name="dueDate" type="date" className="input" required />
      </div>
      <div>
        <label className="label">Kategorie (optional)</label>
        <select name="categoryId" className="input" defaultValue="">
          <option value="">—</option>
          <CategoryOptions categories={categories} />
        </select>
      </div>
      {state?.error && (
        <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-3">{state.error}</p>
      )}
      <div className="sm:col-span-2 lg:col-span-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Speichern…" : "Posten hinzufügen"}
        </button>
      </div>
    </form>
  );
}
