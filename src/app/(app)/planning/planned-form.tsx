"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPlannedItem } from "@/app/actions/planning";
import { CategoryOptions, type CatOpt } from "@/components/category-select";
import { useActionToast } from "@/components/action-toaster";

export function PlannedForm({ categories }: { categories: CatOpt[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [rec, setRec] = useState("MONTHLY");
  const once = rec === "ONCE";
  const [state, action, pending] = useActionState(
    async (_p: { error?: string; ok?: boolean }, fd: FormData) => createPlannedItem(fd),
    {},
  );
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      setRec("MONTHLY");
    }
  }, [state]);
  useActionToast(state, "Planposten angelegt");

  return (
    <form ref={ref} action={action} data-no-toast className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <label className="label">Bezeichnung</label>
        <input name="name" className="input" placeholder="z.B. Büromiete, Gehalt, Steuer-VZ" required />
      </div>
      <div>
        <label className="label">Richtung</label>
        <select name="direction" className="input" defaultValue="out">
          <option value="in">Einzahlung (+)</option>
          <option value="out">Auszahlung (−)</option>
        </select>
      </div>
      <div>
        <label className="label">Betrag (€)</label>
        <input name="amount" className="input" placeholder="1.200,00" inputMode="decimal" required />
      </div>
      <div>
        <label className="label">Rhythmus</label>
        <select name="recurrence" className="input" value={rec} onChange={(e) => setRec(e.target.value)}>
          <option value="ONCE">einmalig (datumsgenau)</option>
          <option value="WEEKLY">wöchentlich</option>
          <option value="MONTHLY">monatlich</option>
          <option value="QUARTERLY">quartalsweise</option>
          <option value="YEARLY">jährlich</option>
        </select>
      </div>
      {!once && (
        <div>
          <label className="label">Intervall (jede/r n-te)</label>
          <input name="interval" type="number" min={1} defaultValue={1} className="input" />
        </div>
      )}
      <div>
        <label className="label">{once ? "Datum" : "Ab Datum"}</label>
        <input name="startDate" type="date" className="input" required />
      </div>
      {!once && (
        <div>
          <label className="label">Bis (optional)</label>
          <input name="endDate" type="date" className="input" />
        </div>
      )}
      <div>
        <label className="label">Kategorie (optional)</label>
        <select name="categoryId" className="input" defaultValue="">
          <option value="">—</option>
          <CategoryOptions categories={categories} />
        </select>
      </div>
      {state?.error && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-3">{state.error}</p>}
      <div className="sm:col-span-2 lg:col-span-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Speichern…" : "Planposten hinzufügen"}
        </button>
      </div>
    </form>
  );
}
