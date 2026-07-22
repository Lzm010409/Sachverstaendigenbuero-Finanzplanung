"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBudget, updateBudget } from "@/app/actions/budgets";
import { BUDGET_PERIODS } from "@/lib/budget";
import type { CatOption } from "../categories/category-forms";

export interface BudgetView {
  id: string;
  title: string;
  kind: "INCOME" | "EXPENSE";
  amount: number; // Cent je Periode
  period: string;
  categoryId: string | null;
  startDate: string | null; // yyyy-mm-dd
  endDate: string | null;
  note: string | null;
  active: boolean;
  includeInForecast: boolean;
}

// Kategorie-Auswahl mit „keine"-Option (Budget kann ohne Kategorie bestehen).
function CategoryOptional({ categories, defaultValue }: { categories: CatOption[]; defaultValue?: string | null }) {
  const income = categories.filter((c) => c.kind === "INCOME");
  const expense = categories.filter((c) => c.kind === "EXPENSE");
  return (
    <select name="categoryId" className="input py-1 text-sm" defaultValue={defaultValue ?? ""}>
      <option value="">— ohne Kategorie —</option>
      {income.length > 0 && (
        <optgroup label="Einnahmen">
          {income.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      )}
      {expense.length > 0 && (
        <optgroup label="Ausgaben">
          {expense.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      )}
    </select>
  );
}

export function BudgetForm({ categories }: { categories: CatOption[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (_p: { error?: string; ok?: boolean }, fd: FormData) => createBudget(fd),
    {},
  );
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[180px] flex-1">
        <label className="label">Titel</label>
        <input name="title" className="input" placeholder="z.B. Rücklage Steuer, Marketing" required />
      </div>
      <div>
        <label className="label">Art</label>
        <select name="kind" className="input" defaultValue="EXPENSE">
          <option value="INCOME">Einnahme</option>
          <option value="EXPENSE">Ausgabe</option>
        </select>
      </div>
      <div className="w-28">
        <label className="label">Betrag</label>
        <input name="amount" className="input" inputMode="decimal" placeholder="0,00" required />
      </div>
      <div>
        <label className="label">Rhythmus</label>
        <select name="period" className="input" defaultValue="MONTHLY">
          {BUDGET_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
      <div className="min-w-[150px]">
        <label className="label">Kategorie (optional)</label>
        <CategoryOptional categories={categories} />
      </div>
      <div>
        <label className="label">Gültig ab</label>
        <input name="startDate" type="date" className="input py-1 text-sm" />
      </div>
      <div>
        <label className="label">Gültig bis</label>
        <input name="endDate" type="date" className="input py-1 text-sm" />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
        <input type="checkbox" name="includeInForecast" className="h-4 w-4 rounded border-slate-300" />
        In Liquiditätsprognose einplanen
      </label>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "…" : "Budget anlegen"}
      </button>
      <p className="w-full text-xs text-slate-400">
        Aktiviert fließt das Budget als wiederkehrender Planposten (im Rhythmus, innerhalb Gültig-ab/bis)
        in Prognose, 13-Wochen-Vorschau und Übersicht ein. Standard aus, um Doppelzählung mit echten
        Umsätzen/Planposten zu vermeiden.
      </p>
    </form>
  );
}

export function BudgetRow({ budget, categories }: { budget: BudgetView; categories: CatOption[] }) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (_p: { error?: string; ok?: boolean }, fd: FormData) => updateBudget(fd),
    {},
  );
  useEffect(() => {
    if (state?.ok) {
      setEditing(false);
      router.refresh();
    }
  }, [state, router]);

  const amountStr = (budget.amount / 100).toFixed(2).replace(".", ",");

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button onClick={() => setEditing(true)} className="text-left text-brand hover:underline">
          bearbeiten
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={budget.id} />
      <div className="min-w-[150px] flex-1">
        <label className="label">Titel</label>
        <input name="title" className="input py-1 text-sm" defaultValue={budget.title} required />
      </div>
      <div>
        <label className="label">Art</label>
        <select name="kind" className="input py-1 text-sm" defaultValue={budget.kind}>
          <option value="INCOME">Einnahme</option>
          <option value="EXPENSE">Ausgabe</option>
        </select>
      </div>
      <div className="w-24">
        <label className="label">Betrag</label>
        <input name="amount" className="input py-1 text-sm" defaultValue={amountStr} inputMode="decimal" required />
      </div>
      <div>
        <label className="label">Rhythmus</label>
        <select name="period" className="input py-1 text-sm" defaultValue={budget.period}>
          {BUDGET_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
      <div className="min-w-[140px]">
        <label className="label">Kategorie</label>
        <CategoryOptional categories={categories} defaultValue={budget.categoryId} />
      </div>
      <div>
        <label className="label">ab</label>
        <input name="startDate" type="date" className="input py-1 text-sm" defaultValue={budget.startDate ?? ""} />
      </div>
      <div>
        <label className="label">bis</label>
        <input name="endDate" type="date" className="input py-1 text-sm" defaultValue={budget.endDate ?? ""} />
      </div>
      <label className="flex items-center gap-2 pb-1 text-sm text-slate-600">
        <input type="checkbox" name="includeInForecast" defaultChecked={budget.includeInForecast} className="h-4 w-4 rounded border-slate-300" />
        in Prognose
      </label>
      <button type="submit" className="btn-primary px-3 py-1 text-sm" disabled={pending}>
        {pending ? "…" : "Speichern"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="btn-secondary px-3 py-1 text-sm">
        Abbrechen
      </button>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

export function DeleteBudgetButton({ action, id, confirm: msg, children }: {
  action: (fd: FormData) => Promise<void>;
  id: string;
  confirm?: string;
  children: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      className="text-xs text-slate-400 hover:text-red-600"
      disabled={pending}
      onClick={() => {
        if (msg && !confirm(msg)) return;
        const fd = new FormData();
        fd.set("id", id);
        start(() => action(fd));
      }}
    >
      {children}
    </button>
  );
}
