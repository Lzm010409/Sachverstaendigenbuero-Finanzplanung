"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createCustomKpi, updateCustomKpi } from "@/app/actions/custom-kpi";
import { useActionToast } from "@/components/action-toaster";
import { CategoryOptions, type CatOpt } from "@/components/category-select";

export interface KpiInitial {
  id: string;
  name: string;
  metric: string;
  categoryIds: string[];
  rangeKind: string;
  customFrom: string | null;
  customTo: string | null;
  display: string;
  groupBy: string;
  size: string;
  compare: boolean;
  showOnDashboard: boolean;
  showOnReport: boolean;
}

const METRICS: [string, string][] = [
  ["net", "Netto (Ein − Aus)"],
  ["income", "Einnahmen"],
  ["expense", "Ausgaben"],
  ["volume", "Umsatzvolumen"],
  ["count", "Anzahl Buchungen"],
  ["avg", "Ø Betrag / Buchung"],
];
const RANGES: [string, string][] = [
  ["mtd", "laufender Monat"],
  ["last_month", "Vormonat"],
  ["ytd", "laufendes Jahr"],
  ["last_year", "Vorjahr"],
  ["last_30d", "letzte 30 Tage"],
  ["last_90d", "letzte 90 Tage"],
  ["rolling_12m", "letzte 12 Monate"],
  ["custom", "eigener Zeitraum"],
];
const DISPLAYS: [string, string][] = [
  ["number", "Kennzahl (Zahl)"],
  ["bar", "Balkendiagramm"],
  ["line", "Liniendiagramm"],
  ["pie", "Kreisdiagramm"],
];
const SIZES: [string, string][] = [
  ["sm", "Klein"],
  ["md", "Mittel"],
  ["lg", "Groß"],
  ["xl", "Sehr groß"],
];

export function KpiForm({
  categories,
  initial,
  onDone,
}: {
  categories: CatOpt[];
  initial?: KpiInitial;
  onDone?: () => void;
}) {
  const isEdit = !!initial;
  const ref = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(
    async (_p: { error?: string; ok?: boolean }, fd: FormData) => (isEdit ? updateCustomKpi(fd) : createCustomKpi(fd)),
    {},
  );
  useActionToast(state, isEdit ? "Kennzahl gespeichert" : "Kennzahl angelegt");
  useEffect(() => {
    if (state?.ok) {
      if (!isEdit) ref.current?.reset();
      onDone?.();
    }
  }, [state, isEdit, onDone]);

  const [display, setDisplay] = useState(initial?.display ?? "number");
  const [rangeKind, setRangeKind] = useState(initial?.rangeKind ?? "ytd");
  const isNumber = display === "number";
  const isPie = display === "pie";

  return (
    <form ref={ref} action={action} data-no-toast className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {isEdit && <input type="hidden" name="id" value={initial!.id} />}
      <div className="sm:col-span-2 lg:col-span-1">
        <label className="label">Name</label>
        <input name="name" defaultValue={initial?.name ?? ""} className="input" placeholder="z.B. Benzinkosten 2026" required />
      </div>
      <div>
        <label className="label">Kennzahl</label>
        <select name="metric" defaultValue={initial?.metric ?? "net"} className="input">
          {METRICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Zeitraum</label>
        <select name="rangeKind" defaultValue={rangeKind} onChange={(e) => setRangeKind(e.target.value)} className="input">
          {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {rangeKind === "custom" && (
        <>
          <div>
            <label className="label">Von</label>
            <input name="customFrom" type="date" defaultValue={initial?.customFrom ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Bis</label>
            <input name="customTo" type="date" defaultValue={initial?.customTo ?? ""} className="input" />
          </div>
        </>
      )}
      <div>
        <label className="label">Darstellung</label>
        <select name="display" defaultValue={display} onChange={(e) => setDisplay(e.target.value)} className="input">
          {DISPLAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {!isNumber && !isPie && (
        <div>
          <label className="label">Gruppierung</label>
          <select name="groupBy" defaultValue={initial?.groupBy && initial.groupBy !== "none" ? initial.groupBy : "month"} className="input">
            <option value="month">nach Monat</option>
            <option value="week">nach Woche</option>
            <option value="category">nach Kategorie</option>
            <option value="categoryGroup">nach Überkategorie</option>
          </select>
        </div>
      )}
      {isPie && (
        <div>
          <label className="label">Gruppierung</label>
          <select
            name="groupBy"
            defaultValue={initial?.groupBy === "categoryGroup" ? "categoryGroup" : "category"}
            className="input"
          >
            <option value="category">nach Kategorie</option>
            <option value="categoryGroup">nach Überkategorie</option>
          </select>
        </div>
      )}
      {isNumber && <input type="hidden" name="groupBy" value="none" />}
      <div>
        <label className="label">Größe</label>
        <select name="size" defaultValue={initial?.size ?? "md"} className="input">
          {SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <label className="label">Kategorien (leer = alle)</label>
        <select name="categoryIds" multiple defaultValue={initial?.categoryIds ?? []} className="input h-28">
          <CategoryOptions categories={categories} />
        </select>
        <p className="mt-1 text-xs text-slate-400">Mehrfachauswahl mit Strg/Cmd bzw. Umschalt. Transfers sind immer ausgenommen.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-3">
        {isNumber && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="compare" defaultChecked={initial?.compare} className="h-4 w-4" /> Vergleich zur Vorperiode
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="showOnDashboard" defaultChecked={initial?.showOnDashboard} className="h-4 w-4" /> auf Übersicht zeigen
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="showOnReport" defaultChecked={initial?.showOnReport} className="h-4 w-4" /> im Bericht drucken
        </label>
      </div>
      {state?.error && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-3">{state.error}</p>}
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
        <button className="btn-primary" type="submit">{isEdit ? "Speichern" : "Kennzahl anlegen"}</button>
        {isEdit && onDone && <button type="button" className="btn-secondary" onClick={onDone}>Abbrechen</button>}
      </div>
    </form>
  );
}
