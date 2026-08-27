"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  applyHistoryCategorization,
  applyRulesToUncategorized,
  createCategory,
  createCategoryGroup,
  applyCategoryGroupSuggestion,
  setCategoryParent,
  createRule,
  resetAllTransactionCategories,
} from "@/app/actions/categories";
import { RuleBuilder, type AccountOpt } from "./rule-builder";
import { notify, useActionToast } from "@/components/action-toaster";
import { CategoryOptions, CategoryGroupOptions } from "@/components/category-select";

export function CategoryForm({ groups = [] }: { groups?: CatOption[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (_p: { error?: string; ok?: boolean }, fd: FormData) => createCategory(fd),
    {},
  );
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  useActionToast(state, "Kategorie angelegt");

  return (
    <form ref={ref} action={action} data-no-toast className="flex flex-wrap items-end gap-3">
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
      {groups.length > 0 && (
        <div className="min-w-[160px]">
          <label className="label">Überkategorie</label>
          <select name="parentId" className="input" defaultValue="">
            <option value="">– keine –</option>
            <CategoryGroupOptions groups={groups} />
          </select>
        </div>
      )}
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

/** Legt eine Überkategorie an (reine Gliederung, nicht bebuchbar). */
export function CategoryGroupForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (_p: { error?: string; ok?: boolean }, fd: FormData) => createCategoryGroup(fd),
    {},
  );
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  useActionToast(state, "Überkategorie angelegt");

  return (
    <form ref={ref} action={action} data-no-toast className="flex flex-wrap items-end gap-3">
      <div className="min-w-[160px] flex-1">
        <label className="label">Name</label>
        <input name="name" className="input" placeholder="z.B. Fahrzeugkosten" required />
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
        <input name="color" type="color" defaultValue="#475569" className="h-10 w-16 rounded border border-slate-300" />
      </div>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "…" : "Anlegen"}
      </button>
    </form>
  );
}

/**
 * Zuordnung einer Kategorie zu einer Überkategorie. Sendet direkt bei
 * Auswahländerung – ohne zusätzlichen Speichern-Klick.
 */
export function ParentSelect({
  id,
  parentId,
  groups,
}: {
  id: string;
  parentId: string | null;
  groups: { id: string; name: string; kind: "INCOME" | "EXPENSE" }[];
}) {
  const [pending, startTransition] = useTransition();

  if (groups.length === 0) {
    return <span className="text-xs text-slate-300">–</span>;
  }

  return (
    <select
      className="input py-1 text-xs"
      defaultValue={parentId ?? ""}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("id", id);
        fd.set("parentId", e.target.value);
        startTransition(async () => {
          const res = await setCategoryParent(fd);
          if (res?.error) notify(res.error, "error");
          else notify("Überkategorie geändert");
        });
      }}
    >
      <option value="">– keine –</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  );
}

/**
 * Zeigt den abgeleiteten Überkategorie-Vorschlag und wendet ihn erst auf
 * Bestätigung an. Bestehende Zuordnungen bleiben unberührt.
 */
export function GroupSuggestion({
  vorschlaege,
}: {
  vorschlaege: { gruppe: string; farbe: string; kind: "INCOME" | "EXPENSE"; categoryIds: string[]; namen: string[] }[];
}) {
  const [state, action, pending] = useActionState(
    async (_p: { error?: string; ok?: boolean; message?: string }, fd: FormData) =>
      applyCategoryGroupSuggestion(fd),
    {},
  );
  useEffect(() => {
    if (state?.ok) notify(state.message ?? "Vorschlag übernommen");
  }, [state]);

  if (vorschlaege.length === 0) return null;
  const gesamt = vorschlaege.reduce((s, v) => s + v.categoryIds.length, 0);

  return (
    <form action={action} data-no-toast className="space-y-3">
      <input
        type="hidden"
        name="vorschlag"
        value={JSON.stringify(
          vorschlaege.map((v) => ({
            gruppe: v.gruppe,
            farbe: v.farbe,
            kind: v.kind,
            categoryIds: v.categoryIds,
          })),
        )}
      />
      <div className="grid gap-2 md:grid-cols-2">
        {vorschlaege.map((v) => (
          <div key={v.gruppe} className="rounded-md border border-slate-200 p-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: v.farbe }} />
              {v.gruppe}
              <span className="text-xs font-normal text-slate-400">
                {v.kind === "INCOME" ? "Einnahmen" : "Ausgaben"} · {v.categoryIds.length}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{v.namen.join(" · ")}</p>
          </div>
        ))}
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "…" : `Vorschlag übernehmen (${vorschlaege.length} Überkategorien, ${gesamt} Kategorien)`}
      </button>
    </form>
  );
}

export interface CatOption {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  parentId?: string | null;
  isGroup?: boolean;
}

// Kategorie-Auswahl – Gliederung (Einnahme/Ausgabe + Überkategorie) kommt aus
// der gemeinsamen Komponente, damit es nur eine Quelle der Wahrheit gibt.
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
  return (
    <select name={name} className="input py-1 text-sm" required={required} defaultValue={defaultValue ?? ""}>
      {!defaultValue && (
        <option value="" disabled>
          wählen…
        </option>
      )}
      <CategoryOptions categories={categories} />
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
  useActionToast(state, "Regel gespeichert");

  return (
    <form key={formKey} action={action} data-no-toast className="space-y-3">
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
