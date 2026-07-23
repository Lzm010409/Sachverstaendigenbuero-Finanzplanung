"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  applyHistoryCategorization,
  applyRulesToUncategorized,
  createCategory,
  createRule,
  resetAllTransactionCategories,
} from "@/app/actions/categories";
import { RuleBuilder, type AccountOpt } from "./rule-builder";

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
        <input name="color" type="color" defaultValue="#007FFF" className="h-10 w-16 rounded border border-slate-300" />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm text-slate-600" title="Konto-zu-Konto-Transfer – zählt nicht als Einnahme/Ausgabe">
        <input type="checkbox" name="isTransfer" className="h-4 w-4 rounded border-slate-300" />
        Geldtransfer (neutral)
      </label>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "…" : "Hinzufügen"}
      </button>
    </form>
  );
}

export interface CatOption {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
}

// Kategorie-Auswahl nach Einnahme/Ausgabe gruppiert (optgroup).
export function CategorySelect({
  name,
  categories,
  defaultValue,
  required,
}: {
  name: string;
  categories: CatOption[];
  defaultValue?: string;
  required?: boolean;
}) {
  const income = categories.filter((c) => c.kind === "INCOME");
  const expense = categories.filter((c) => c.kind === "EXPENSE");
  return (
    <select name={name} className="input py-1 text-sm" required={required} defaultValue={defaultValue ?? ""}>
      {!defaultValue && (
        <option value="" disabled>
          wählen…
        </option>
      )}
      {income.length > 0 && (
        <optgroup label="Einnahmen">
          {income.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </optgroup>
      )}
      {expense.length > 0 && (
        <optgroup label="Ausgaben">
          {expense.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

export function RuleForm({ categories, accounts }: { categories: CatOption[]; accounts: AccountOpt[] }) {
  // Beim Zurücksetzen den Builder über einen Key neu mounten (leert den Baum).
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(
    async (_p: { error?: string; ok?: boolean }, fd: FormData) => createRule(fd),
    {},
  );
  useEffect(() => {
    if (state?.ok) setFormKey((k) => k + 1);
  }, [state]);

  return (
    <form key={formKey} action={action} className="space-y-3">
      <div>
        <label className="label">Bedingung (beliebig verschachtelbar mit UND / ODER / NICHT)</label>
        <RuleBuilder name="conditions" accounts={accounts} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px]">
          <label className="label">→ Kategorie</label>
          <CategorySelect name="categoryId" categories={categories} required />
        </div>
        <div className="w-20">
          <label className="label">Priorität</label>
          <input name="priority" type="number" className="input" defaultValue={100} title="kleiner = zuerst geprüft" />
        </div>
        {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "…" : "Regel anlegen"}
        </button>
      </div>
    </form>
  );
}

export function ApplyRulesButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const run = (fn: () => Promise<{ updated: number }>) =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      setMsg(`${res.updated} Umsätze kategorisiert.`);
    });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn-secondary" disabled={pending} onClick={() => run(applyRulesToUncategorized)}>
        {pending ? "Wende an…" : "Regeln auf offene Umsätze anwenden"}
      </button>
      <button className="btn-secondary" disabled={pending} onClick={() => run(applyHistoryCategorization)}>
        {pending ? "…" : "Aus kategorisierten Umsätzen lernen"}
      </button>
      {msg && <span className="text-sm text-emerald-600">{msg}</span>}
      <p className="w-full text-xs text-slate-400">
        „Aus kategorisierten Umsätzen lernen" überträgt die häufigste Kategorie je Gegenpartei auf
        noch offene Umsätze – ideal, um viele Umsätze auf einmal zuzuordnen.
      </p>
    </div>
  );
}

export function ResetCategoriesButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className="btn-danger"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              "Wirklich ALLE Kategorie-Zuordnungen entfernen?\n\nDie Umsätze selbst bleiben erhalten – nur die Kategorien werden geleert. Danach kannst du neu kategorisieren.",
            )
          )
            return;
          start(async () => {
            const r = await resetAllTransactionCategories();
            setMsg(`${r.updated} Umsätze zurückgesetzt.`);
          });
        }}
      >
        {pending ? "Setze zurück…" : "Alle Kategorien zurücksetzen"}
      </button>
      {msg && <span className="text-sm text-emerald-600">{msg}</span>}
    </div>
  );
}
