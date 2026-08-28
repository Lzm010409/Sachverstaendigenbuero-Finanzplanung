"use client";

import { useState } from "react";
import Link from "next/link";
import { CustomKpiCard, spanClass } from "@/components/custom-kpi-card";
import type { CustomKpiResult } from "@/lib/custom-kpi";
import type { CatOpt } from "@/components/category-select";
import { deleteCustomKpi, setCustomKpiFlag, setCustomKpiSize } from "@/app/actions/custom-kpi";
import { KpiForm, type KpiInitial } from "./kpi-form";

const SIZES: [string, string][] = [["sm", "Klein"], ["md", "Mittel"], ["lg", "Groß"], ["xl", "Sehr groß"]];

export function KpiItem({
  result,
  initial,
  categories,
}: {
  result: CustomKpiResult;
  initial: KpiInitial;
  categories: CatOpt[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className={`card ${spanClass(result.size)}`}>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Kennzahl bearbeiten</h3>
        <KpiForm categories={categories} initial={initial} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className={`card ${spanClass(result.size)} break-inside-avoid`}>
      <CustomKpiCard result={result} embedded />
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2 text-xs">
        <form action={setCustomKpiSize} className="flex items-center gap-1">
          <input type="hidden" name="id" value={initial.id} />
          <span className="text-slate-400">Größe</span>
          <select name="size" defaultValue={initial.size} className="input w-auto px-1 py-0.5 text-xs" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
            {SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </form>
        <form action={setCustomKpiFlag}>
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="field" value="showOnDashboard" />
          <button className={initial.showOnDashboard ? "text-brand" : "text-slate-400 hover:text-brand"} title="Auf der Übersicht anzeigen">
            {initial.showOnDashboard ? "✓ Übersicht" : "Übersicht"}
          </button>
        </form>
        <form action={setCustomKpiFlag}>
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="field" value="showOnReport" />
          <button className={initial.showOnReport ? "text-brand" : "text-slate-400 hover:text-brand"} title="Im Bericht drucken">
            {initial.showOnReport ? "✓ Bericht" : "Bericht"}
          </button>
        </form>
        <Link href={`/custom-kpis/${initial.id}`} className="text-slate-400 hover:text-brand">Transaktionen</Link>
        <button className="text-slate-400 hover:text-brand" onClick={() => setEditing(true)}>Bearbeiten</button>
        <form action={deleteCustomKpi} data-toast="Kennzahl gelöscht" className="ml-auto">
          <input type="hidden" name="id" value={initial.id} />
          <button className="text-slate-400 hover:text-red-600">Löschen</button>
        </form>
      </div>
    </div>
  );
}
