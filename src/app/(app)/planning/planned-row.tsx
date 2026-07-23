"use client";

import { useState } from "react";
import { deletePlannedItem, togglePlannedItem, updatePlannedItem } from "@/app/actions/planning";
import { CategoryOptions, type CatOpt } from "@/components/category-select";
import { formatCents } from "@/lib/money";

const RHYTHM: Record<string, string> = {
  ONCE: "einmalig",
  WEEKLY: "wöchentlich",
  MONTHLY: "monatlich",
  QUARTERLY: "quartalsweise",
  YEARLY: "jährlich",
};

export interface PlannedRowData {
  id: string;
  name: string;
  amount: number; // Cent, vorzeichenbehaftet
  recurrence: string;
  interval: number;
  startDate: string; // ISO
  endDate: string | null; // ISO
  categoryId: string | null;
  categoryName: string | null;
  active: boolean;
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const euro = (cents: number) => (Math.abs(cents) / 100).toFixed(2).replace(".", ",");

export function PlannedRow({ item, categories }: { item: PlannedRowData; categories: CatOpt[] }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <tr className="border-b border-slate-100 bg-brand/5">
        <td className="td" colSpan={6}>
          <form
            action={async (fd) => {
              fd.set("id", item.id);
              await updatePlannedItem(fd);
              setEditing(false);
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div className="lg:col-span-2">
              <label className="label">Bezeichnung</label>
              <input name="name" defaultValue={item.name} className="input" required />
            </div>
            <div>
              <label className="label">Richtung</label>
              <select name="direction" className="input" defaultValue={item.amount < 0 ? "out" : "in"}>
                <option value="in">Einzahlung (+)</option>
                <option value="out">Auszahlung (−)</option>
              </select>
            </div>
            <div>
              <label className="label">Betrag (€)</label>
              <input name="amount" defaultValue={euro(item.amount)} className="input" inputMode="decimal" required />
            </div>
            <div>
              <label className="label">Rhythmus</label>
              <select name="recurrence" className="input" defaultValue={item.recurrence}>
                <option value="ONCE">einmalig</option>
                <option value="WEEKLY">wöchentlich</option>
                <option value="MONTHLY">monatlich</option>
                <option value="QUARTERLY">quartalsweise</option>
                <option value="YEARLY">jährlich</option>
              </select>
            </div>
            <div>
              <label className="label">Intervall (jede/r n-te)</label>
              <input name="interval" type="number" min={1} defaultValue={item.interval} className="input" />
            </div>
            <div>
              <label className="label">Ab Datum</label>
              <input name="startDate" type="date" defaultValue={day(item.startDate)} className="input" required />
            </div>
            <div>
              <label className="label">Bis (optional)</label>
              <input name="endDate" type="date" defaultValue={day(item.endDate)} className="input" />
            </div>
            <div>
              <label className="label">Kategorie (optional)</label>
              <select name="categoryId" className="input" defaultValue={item.categoryId ?? ""}>
                <option value="">—</option>
                <CategoryOptions categories={categories} />
              </select>
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <button type="submit" className="btn-primary px-3 py-1.5 text-sm">Speichern</button>
              <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setEditing(false)}>
                Abbrechen
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`border-b border-slate-50 ${item.active ? "" : "opacity-50"}`}>
      <td className="td font-medium">
        {item.name}
        {item.categoryName && <span className="ml-2 text-xs text-slate-400">{item.categoryName}</span>}
      </td>
      <td className="td">
        {RHYTHM[item.recurrence]}
        {item.interval > 1 ? ` (×${item.interval})` : ""}
      </td>
      <td className="td">{new Date(item.startDate).toLocaleDateString("de-DE")}</td>
      <td className="td">{item.endDate ? new Date(item.endDate).toLocaleDateString("de-DE") : "offen"}</td>
      <td className={`td text-right font-semibold ${item.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>
        {formatCents(item.amount)}
      </td>
      <td className="td">
        <div className="flex justify-end gap-3">
          <button className="text-xs text-brand hover:underline" onClick={() => setEditing(true)}>
            bearbeiten
          </button>
          <form action={togglePlannedItem}>
            <input type="hidden" name="id" value={item.id} />
            <button className="text-xs text-slate-400 hover:text-brand">
              {item.active ? "pausieren" : "aktivieren"}
            </button>
          </form>
          <form action={deletePlannedItem}>
            <input type="hidden" name="id" value={item.id} />
            <button className="text-xs text-slate-400 hover:text-red-600">löschen</button>
          </form>
        </div>
      </td>
    </tr>
  );
}
