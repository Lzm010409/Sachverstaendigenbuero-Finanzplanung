"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { applyRulesToUncategorized, createCategory, createRule } from "@/app/actions/categories";

export function CategoryForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (_p: { error?: string; ok?: boolean }, fd: FormData) => createCategory(fd),
    {},
  );
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[180px] flex-1">
        <label className="label">Name</label>
        <input name="name" className="input" placeholder="z.B. Miete, Honorare" required />
      </div>
      <div>
        <label className="label">Art</label>
        <select name="kind" className="input" defaultValue="EXPENSE">
          <option value="INCOME">Einnahme</option>
          <option value="EXPENSE">Ausgabe</option>
        </select>
      </div>
      <div>
        <label className="label">Farbe</label>
        <input name="color" type="color" defaultValue="#0f766e" className="h-10 w-16 rounded border border-slate-300" />
      </div>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "…" : "Hinzufügen"}
      </button>
    </form>
  );
}

export function RuleForm({ categories }: { categories: { id: string; name: string }[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (_p: { error?: string; ok?: boolean }, fd: FormData) => createRule(fd),
    {},
  );
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label">Wenn Feld</label>
        <select name="field" className="input" defaultValue="PURPOSE">
          <option value="PURPOSE">Verwendungszweck</option>
          <option value="COUNTERPARTY">Gegenpartei</option>
        </select>
      </div>
      <div className="min-w-[160px] flex-1">
        <label className="label">enthält / Regex</label>
        <input name="pattern" className="input" placeholder="z.B. miete oder /amazon/" required />
      </div>
      <div className="min-w-[140px]">
        <label className="label">Kategorie</label>
        <select name="categoryId" className="input" required defaultValue="">
          <option value="" disabled>
            wählen…
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="w-20">
        <label className="label">Prio</label>
        <input name="priority" type="number" className="input" defaultValue={100} />
      </div>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "…" : "Regel"}
      </button>
    </form>
  );
}

export function ApplyRulesButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        className="btn-secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await applyRulesToUncategorized();
            setMsg(`${res.updated} Umsätze kategorisiert.`);
          })
        }
      >
        {pending ? "Wende an…" : "Regeln auf offene Umsätze anwenden"}
      </button>
      {msg && <span className="text-sm text-emerald-600">{msg}</span>}
    </div>
  );
}
