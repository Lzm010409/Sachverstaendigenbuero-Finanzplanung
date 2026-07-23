"use client";

import { useState } from "react";
import { deleteRule, toggleRuleActive, updateRule } from "@/app/actions/categories";
import { type AccountNameMap, type Node, describeTree } from "@/lib/rule-expr";
import { CategorySelect, type CatOption } from "./category-forms";
import { RuleBuilder, type AccountOpt } from "./rule-builder";

export interface RuleData {
  id: string;
  conditions: Node | null;
  priority: number;
  active: boolean;
  categoryId: string;
  categoryName: string;
}

export function RuleRow({
  rule,
  categories,
  accounts,
}: {
  rule: RuleData;
  categories: CatOption[];
  accounts: AccountOpt[];
}) {
  const [editing, setEditing] = useState(false);
  const accMap: AccountNameMap = Object.fromEntries(accounts.map((a) => [a.id, a.name]));

  if (editing) {
    return (
      <tr className="border-b border-slate-100 bg-brand/5">
        <td className="td" colSpan={4}>
          <form
            action={async (fd) => {
              fd.set("id", rule.id);
              await updateRule(fd);
              setEditing(false);
            }}
            className="space-y-3"
          >
            <RuleBuilder name="conditions" initial={rule.conditions} accounts={accounts} />
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[160px]">
                <label className="label">→ Kategorie</label>
                <CategorySelect name="categoryId" categories={categories} defaultValue={rule.categoryId} required />
              </div>
              <div className="w-20">
                <label className="label">Priorität</label>
                <input name="priority" type="number" defaultValue={rule.priority} className="input py-1 text-sm" />
              </div>
              <button type="submit" className="btn-primary px-3 py-1 text-sm">Speichern</button>
              <button type="button" className="btn-secondary px-3 py-1 text-sm" onClick={() => setEditing(false)}>Abbrechen</button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`border-b border-slate-50 ${rule.active ? "" : "opacity-40"}`}>
      <td className="td align-top text-slate-500">{rule.priority}</td>
      <td className="td align-top">
        {rule.conditions ? (
          <span className="text-sm text-slate-700">{describeTree(rule.conditions, accMap)}</span>
        ) : (
          <span className="text-xs text-slate-400">— leer —</span>
        )}
      </td>
      <td className="td align-top font-medium">{rule.categoryName}</td>
      <td className="td align-top">
        <div className="flex items-center justify-end gap-3">
          <button className="text-xs text-brand hover:underline" onClick={() => setEditing(true)}>bearbeiten</button>
          <form action={toggleRuleActive}>
            <input type="hidden" name="id" value={rule.id} />
            <button className="text-xs text-slate-400 hover:text-slate-700" title="aktiv/inaktiv">
              {rule.active ? "aktiv" : "inaktiv"}
            </button>
          </form>
          <form action={deleteRule}>
            <input type="hidden" name="id" value={rule.id} />
            <button className="text-xs text-slate-400 hover:text-red-600">löschen</button>
          </form>
        </div>
      </td>
    </tr>
  );
}
