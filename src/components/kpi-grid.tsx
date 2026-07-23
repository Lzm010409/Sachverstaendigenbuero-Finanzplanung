"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { KpiDescriptor, KpiTone } from "@/lib/dashboard-kpis";

const STORE_KEY = "dash:kpis";

const toneClass: Record<KpiTone, string> = {
  default: "text-slate-900",
  positive: "text-emerald-600",
  negative: "text-red-600",
  warning: "text-amber-600",
};

function KpiCard({ kpi }: { kpi: KpiDescriptor }) {
  const inner = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{kpi.label}</div>
      <div className={`mt-1 text-xl font-bold ${toneClass[kpi.tone ?? "default"]}`}>{kpi.value}</div>
      {kpi.hint && <div className="mt-0.5 text-xs text-slate-400">{kpi.hint}</div>}
    </>
  );
  if (kpi.href) {
    return (
      <Link href={kpi.href} className="card block transition hover:ring-2 hover:ring-brand/30">
        {inner}
        <div className="mt-1 text-xs text-brand">Details →</div>
      </Link>
    );
  }
  return <div className="card">{inner}</div>;
}

export function KpiGrid({ kpis, defaultIds }: { kpis: KpiDescriptor[]; defaultIds: string[] }) {
  const [visible, setVisible] = useState<string[]>(defaultIds);
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) setVisible(ids.filter((id) => typeof id === "string"));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (ids: string[]) => {
    setVisible(ids);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  };

  const toggle = (id: string) => {
    persist(visible.includes(id) ? visible.filter((x) => x !== id) : [...visible, id]);
  };

  const byId = new Map(kpis.map((k) => [k.id, k]));
  // Sichtbare KPIs in der gewählten Reihenfolge; unbekannte IDs überspringen.
  const shown = visible.map((id) => byId.get(id)).filter((k): k is KpiDescriptor => !!k);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{mounted ? `${shown.length} von ${kpis.length} Kennzahlen` : ""}</span>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="btn-secondary px-3 py-1 text-xs"
        >
          {editing ? "Fertig" : "KPIs anpassen"}
        </button>
      </div>

      {editing && (
        <div className="card">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Kennzahlen ein-/ausblenden</h3>
            <div className="flex gap-3 text-xs">
              <button type="button" className="text-brand hover:underline" onClick={() => persist(kpis.map((k) => k.id))}>alle</button>
              <button type="button" className="text-brand hover:underline" onClick={() => persist(defaultIds)}>Standard</button>
              <button type="button" className="text-slate-400 hover:underline" onClick={() => persist([])}>keine</button>
            </div>
          </div>
          <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {kpis.map((k) => (
              <label key={k.id} className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={visible.includes(k.id)} onChange={() => toggle(k.id)} />
                {k.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-slate-400">Keine Kennzahlen ausgewählt. Über „KPIs anpassen" welche einblenden.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((k) => (
            <KpiCard key={k.id} kpi={k} />
          ))}
        </div>
      )}
    </div>
  );
}
