"use client";

import { useState } from "react";
import { deleteRule, toggleRuleActive, updateRule } from "@/app/actions/categories";

const FIELD_LABEL: Record<string, string> = { PURPOSE: "Verwendungszweck", COUNTERPARTY: "Gegenpartei" };
const AMOUNT_OP_LABEL: Record<string, string> = { GT: ">", GTE: "≥", LT: "<", LTE: "≤", EQ: "=" };

export interface RuleData {
  id: string;
  field: string;
  pattern: string | null;
  amountOp: string | null;
  amountValue: number | null;
  priority: number;
  active: boolean;
  categoryId: string;
  categoryName: string;
}

function euro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function RuleRow({ rule, categories }: { rule: RuleData; categories: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <tr className="border-b border-slate-100 bg-brand/5">
        <td className="td" colSpan={6}>
          <form
            action={async (fd) => {
              fd.set("id", rule.id);
              await updateRule(fd);
              setEditing(false);
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <div>
              <label className="label">Feld</label>
              <select name="field" defaultValue={rule.field} className="input w-auto py-1 text-sm">
                <option value="PURPOSE">Verwendungszweck</option>
                <option value="COUNTERPARTY">Gegenpartei</option>
              </select>
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="label">enthält / Regex</label>
              <input name="pattern" defaultValue={rule.pattern ?? ""} className="input py-1 text-sm" placeholder="Muster" />
            </div>
            <div className="w-20">
              <label className="label">Betrag</label>
              <select name="amountOp" defaultValue={rule.amountOp ?? ""} className="input py-1 text-sm">
                <option value="">—</option>
                <option value="GT">&gt;</option>
                <option value="GTE">≥</option>
                <option value="LT">&lt;</option>
                <option value="LTE">≤</option>
                <option value="EQ">=</option>
              </select>
            </div>
            <div className="w-24">
              <label className="label">Wert (€)</label>
              <input
                name="amountValue"
                defaultValue={rule.amountValue != null ? euro(rule.amountValue) : ""}
                className="input py-1 text-sm"
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <div className="min-w-[150px]">
              <label className="label">Kategorie</label>
              <select name="categoryId" defaultValue={rule.categoryId} className="input py-1 text-sm" required>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-16">
              <label className="label">Prio</label>
              <input name="priority" type="number" defaultValue={rule.priority} className="input py-1 text-sm" />
            </div>
            <button type="submit" className="btn-primary px-3 py-1 text-sm">
              Speichern
            </button>
            <button type="button" className="btn-secondary px-3 py-1 text-sm" onClick={() => setEditing(false)}>
              Abbrechen
            </button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`border-b border-slate-50 ${rule.active ? "" : "opacity-40"}`}>
      <td className="td">{rule.priority}</td>
      <td className="td">{FIELD_LABEL[rule.field]}</td>
      <td className="td font-mono text-xs">{rule.pattern || "—"}</td>
      <td className="td whitespace-nowrap text-xs">
        {rule.amountOp && rule.amountValue != null ? `${AMOUNT_OP_LABEL[rule.amountOp]} ${euro(rule.amountValue)} €` : "—"}
      </td>
      <td className="td">{rule.categoryName}</td>
      <td className="td">
        <div className="flex items-center justify-end gap-3">
          <button className="text-xs text-brand hover:underline" onClick={() => setEditing(true)}>
            bearbeiten
          </button>
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
