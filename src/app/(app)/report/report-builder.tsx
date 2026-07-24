"use client";

import { useEffect, useMemo, useState } from "react";
import { CustomKpiCard } from "@/components/custom-kpi-card";
import type { CustomKpiResult } from "@/lib/custom-kpi";

export type ReportTone = "default" | "positive" | "negative" | "warning";

export interface ReportData {
  company: string;
  logoUrl?: string | null;
  dateLabel: string;
  kpis: { id: string; label: string; value: string; hint?: string; tone?: ReportTone; group?: string }[];
  cashflow: { months: { label: string; isFuture: boolean; start: string; inflow: string; outflow: string; end: string; endNegative: boolean }[] };
  weekly: {
    startBalance: string;
    endBalance: string;
    low: { label: string; value: string; negative: boolean } | null;
    weeks: { label: string; start: string; inflow: string; outflow: string; end: string; below: boolean }[];
  };
  receivables: { buckets: { label: string; amount: string; count: number }[]; totalOpen: string; overdueOpen: string; dso: string };
  vat: { periods: { label: string; payable: string; estimate: boolean }[]; next: { payable: string; date: string; label: string } | null };
  concentration: { debtors: { name: string; revenue: string; share: string }[]; hhi: number; top1: string; top3: string; total: string };
  custom: CustomKpiResult[];
}

// Reihenfolge der KPI-Gruppen in der Konfiguration und im Bericht.
const GROUP_ORDER = [
  "Bestand & Basis",
  "Monat (laufend)",
  "Budget (Ist/Soll)",
  "Forderungen & Verbindlichkeiten",
  "Prognose",
  "Steuer & Risiko",
  "Weitere",
];

type SectionId = "cashflow" | "weekly" | "receivables" | "vat" | "concentration" | "custom";
const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "cashflow", label: "Liquiditätsverlauf (Monatsmatrix)" },
  { id: "weekly", label: "13-Wochen-Liquiditätsprognose" },
  { id: "receivables", label: "Forderungen (Aging + DSO)" },
  { id: "vat", label: "Steuer-/USt-Vorschau" },
  { id: "concentration", label: "Klumpenrisiko (Top-Debitoren)" },
  { id: "custom", label: "Eigene Kennzahlen" },
];

interface Preset {
  name: string;
  subtitle: string;
  kpis: string[];
  sections: SectionId[];
}

// Vorlagen: sinnvolle Voreinstellungen je Berichtszweck. „Benutzerdefiniert"
// startet von der zuletzt gespeicherten Auswahl.
const PRESETS: Record<string, Preset> = {
  full: {
    name: "Komplettbericht",
    subtitle: "Alle Kennzahlen und Auswertungen",
    kpis: ["balance", "income3m", "expense3m", "netMonthly", "runway", "workingCapital", "budgetIncome", "budgetExpense", "openReceivables", "overdueReceivables", "dso", "openPayables", "forecast30", "forecast90", "lowPoint13w", "minBuffer", "vatNext", "topDebtor"],
    sections: ["cashflow", "weekly", "receivables", "vat", "concentration", "custom"],
  },
  liquidity: {
    name: "Liquidität & Prognose",
    subtitle: "Bestand, Cashflow und Vorschau",
    kpis: ["balance", "netMonthly", "runway", "workingCapital", "forecast30", "forecast90", "lowPoint13w", "minBuffer"],
    sections: ["cashflow", "weekly"],
  },
  receivables: {
    name: "Forderungsbericht",
    subtitle: "Offene Posten, Aging und Risiko",
    kpis: ["openReceivables", "overdueReceivables", "dso", "openPayables", "coverage", "topDebtor"],
    sections: ["receivables", "concentration"],
  },
  tax: {
    name: "Steuerbericht",
    subtitle: "USt-Vorschau und Zahllasten",
    kpis: ["balance", "runway", "vatNext"],
    sections: ["vat"],
  },
  compact: {
    name: "Kompaktbericht",
    subtitle: "Wichtigste Kennzahlen auf einer Seite",
    kpis: ["balance", "income3m", "expense3m", "netMonthly", "runway", "openReceivables"],
    sections: ["cashflow"],
  },
  custom: {
    name: "Benutzerdefiniert",
    subtitle: "Eigene Auswahl",
    kpis: ["balance", "runway", "openReceivables", "forecast90"],
    sections: ["cashflow", "receivables"],
  },
};

const toneCls: Record<ReportTone, string> = {
  default: "text-slate-900",
  positive: "text-emerald-700",
  negative: "text-red-600",
  warning: "text-amber-600",
};

function loadCfg(preset: string): { title: string; kpis: string[]; sections: SectionId[]; landscape: boolean } | null {
  try {
    const raw = localStorage.getItem(`report:cfg:${preset}`);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!Array.isArray(p.kpis) || !Array.isArray(p.sections)) return null;
    return { title: typeof p.title === "string" ? p.title : "", kpis: p.kpis, sections: p.sections, landscape: !!p.landscape };
  } catch {
    return null;
  }
}

export function ReportBuilder({ data }: { data: ReportData }) {
  const [preset, setPreset] = useState<string>("full");
  const [title, setTitle] = useState<string>("");
  const [kpiSel, setKpiSel] = useState<Set<string>>(new Set(PRESETS.full.kpis));
  const [secSel, setSecSel] = useState<Set<SectionId>>(new Set(PRESETS.full.sections));
  const [landscape, setLandscape] = useState(false);
  const [ready, setReady] = useState(false);
  const [showConfig, setShowConfig] = useState(true);

  // Beim ersten Rendern: zuletzt gewählte Vorlage + Auswahl laden.
  useEffect(() => {
    let p = "full";
    try {
      p = localStorage.getItem("report:preset") || "full";
    } catch {
      /* ignore */
    }
    if (!PRESETS[p]) p = "full";
    applyPreset(p, false);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vorlage anwenden: gespeicherte Auswahl bevorzugen, sonst Vorlagen-Standard.
  const applyPreset = (p: string, persist = true) => {
    setPreset(p);
    const saved = loadCfg(p);
    const base = PRESETS[p] ?? PRESETS.full;
    const title = saved?.title ?? "";
    const kpis = saved?.kpis ?? base.kpis;
    const sections = (saved?.sections ?? base.sections) as SectionId[];
    const land = saved?.landscape ?? false;
    setTitle(title);
    setKpiSel(new Set(kpis));
    setSecSel(new Set(sections));
    setLandscape(land);
    try {
      localStorage.setItem("report:preset", p);
      if (persist) save(p, title, kpis, sections, land);
    } catch {
      /* ignore */
    }
  };

  const save = (p: string, t: string, kpis: string[], sections: SectionId[], land: boolean) => {
    try {
      localStorage.setItem(`report:cfg:${p}`, JSON.stringify({ title: t, kpis, sections, landscape: land }));
    } catch {
      /* ignore */
    }
  };

  const toggleKpi = (id: string) => {
    setKpiSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      save(preset, title, [...next], [...secSel], landscape);
      return next;
    });
  };
  const toggleSec = (id: SectionId) => {
    setSecSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      save(preset, title, [...kpiSel], [...next], landscape);
      return next;
    });
  };
  const onTitle = (t: string) => {
    setTitle(t);
    save(preset, t, [...kpiSel], [...secSel], landscape);
  };
  const toggleLandscape = () => {
    setLandscape((prev) => {
      const next = !prev;
      save(preset, title, [...kpiSel], [...secSel], next);
      return next;
    });
  };
  const resetPreset = () => {
    const base = PRESETS[preset] ?? PRESETS.full;
    setTitle("");
    setKpiSel(new Set(base.kpis));
    setSecSel(new Set(base.sections));
    setLandscape(false);
    save(preset, "", base.kpis, [...base.sections], false);
  };

  // KPIs nach Gruppen für die Konfiguration und die Darstellung.
  const grouped = useMemo(() => {
    const byGroup = new Map<string, ReportData["kpis"]>();
    for (const k of data.kpis) {
      const g = k.group ?? "Weitere";
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(k);
    }
    return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({ group: g, items: byGroup.get(g)! }));
  }, [data.kpis]);

  const selectedKpis = data.kpis.filter((k) => kpiSel.has(k.id));
  const reportTitle = title.trim() || PRESETS[preset]?.name || "Bericht";
  // Im Hochformat nur ein Fenster der Monate (passt zuverlässig auf A4 hoch),
  // im Querformat alle geladenen Monate.
  const months = landscape ? data.cashflow.months : data.cashflow.months.slice(0, 6);

  if (!ready) return null;

  return (
    <div className="space-y-6">
      {/* Konfiguration – wird nicht mitgedruckt */}
      <div className="print:hidden space-y-4" data-no-print>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Berichte</h1>
            <p className="text-sm text-slate-500">Vorlage wählen, Kennzahlen &amp; Auswertungen an-/abwählen, dann als PDF drucken.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => setShowConfig((s) => !s)}>
              {showConfig ? "Konfiguration ausblenden" : "Konfiguration einblenden"}
            </button>
            <button className="btn-primary" onClick={() => window.print()}>Als PDF drucken</button>
          </div>
        </div>

        {showConfig && (
          <div className="card space-y-5">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="label">Vorlage</label>
                <select value={preset} onChange={(e) => applyPreset(e.target.value)} className="input w-auto">
                  {Object.entries(PRESETS).map(([id, p]) => (
                    <option key={id} value={id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[220px] flex-1">
                <label className="label">Titel (optional)</label>
                <input value={title} onChange={(e) => onTitle(e.target.value)} className="input" placeholder={PRESETS[preset]?.name} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={landscape} onChange={toggleLandscape} className="h-4 w-4 rounded border-slate-300" />
                Querformat (Landscape)
              </label>
              <button className="btn-secondary" onClick={resetPreset}>Vorlage zurücksetzen</button>
            </div>
            <p className="-mt-2 text-xs text-slate-400">
              {PRESETS[preset]?.subtitle}
              {landscape ? " · Querformat: bis zu 12 Monate im Verlauf." : " · Hochformat: 6 Monate im Verlauf."}
            </p>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Auswertungen</h3>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {SECTIONS.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={secSel.has(s.id)} onChange={() => toggleSec(s.id)} className="h-4 w-4 rounded border-slate-300" />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Kennzahlen ({selectedKpis.length})</h3>
                <div className="flex gap-3 text-xs">
                  <button className="text-brand hover:underline" onClick={() => { const all = data.kpis.map((k) => k.id); setKpiSel(new Set(all)); save(preset, title, all, [...secSel], landscape); }}>alle</button>
                  <button className="text-slate-400 hover:underline" onClick={() => { setKpiSel(new Set()); save(preset, title, [], [...secSel], landscape); }}>keine</button>
                </div>
              </div>
              <div className="space-y-3">
                {grouped.map(({ group, items }) => (
                  <div key={group}>
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{group}</div>
                    <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((k) => (
                        <label key={k.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input type="checkbox" checked={kpiSel.has(k.id)} onChange={() => toggleKpi(k.id)} className="h-4 w-4 rounded border-slate-300" />
                          <span className="truncate">{k.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Seitenausrichtung fürs PDF (nur im Querformat überschreiben). */}
      {landscape && <style>{"@media print { @page { size: A4 landscape; margin: 12mm; } }"}</style>}

      {/* Druckbereich */}
      <div className="report-print space-y-6 print:space-y-4">
        <header className="report-section flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{reportTitle}</h1>
            <p className="text-sm text-slate-500">{data.company} · Stand {data.dateLabel}</p>
          </div>
          {data.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.logoUrl} alt={data.company} className="max-h-16 max-w-[220px] object-contain" />
          )}
        </header>

        {selectedKpis.length > 0 && (
          <section className="report-section card">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Kennzahlen</h2>
            <div className="space-y-4">
              {grouped
                .map(({ group, items }) => ({ group, items: items.filter((k) => kpiSel.has(k.id)) }))
                .filter(({ items }) => items.length > 0)
                .map(({ group, items }) => (
                  <div key={group}>
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">{group}</div>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                      {items.map((k) => (
                        <div key={k.id}>
                          <div className="text-xs text-slate-500">{k.label}</div>
                          <div className={`text-lg font-bold ${toneCls[k.tone ?? "default"]}`}>{k.value}</div>
                          {k.hint && <div className="text-[11px] text-slate-400">{k.hint}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {secSel.has("cashflow") && (
          <section className="report-section card overflow-x-auto p-0">
            <h2 className="px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-slate-600">Liquiditätsverlauf</h2>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="px-3 py-2 text-left">Monat</th>
                  {months.map((m) => (
                    <th key={m.label} className={`px-3 py-2 text-right ${m.isFuture ? "italic text-slate-400" : ""}`}>{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr><td className="px-3 py-1.5 text-slate-600">Liquidität Start</td>{months.map((m) => <td key={m.label} className="px-3 py-1.5 text-right tabular-nums">{m.start}</td>)}</tr>
                <tr><td className="px-3 py-1.5 text-emerald-700">Einzahlungen</td>{months.map((m) => <td key={m.label} className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{m.inflow}</td>)}</tr>
                <tr><td className="px-3 py-1.5 text-red-600">Auszahlungen</td>{months.map((m) => <td key={m.label} className="px-3 py-1.5 text-right tabular-nums text-red-600">{m.outflow}</td>)}</tr>
                <tr className="bg-slate-50 font-semibold"><td className="px-3 py-1.5">Liquidität Ende</td>{months.map((m) => <td key={m.label} className={`px-3 py-1.5 text-right tabular-nums ${m.endNegative ? "text-red-600" : ""}`}>{m.end}</td>)}</tr>
              </tbody>
            </table>
            <p className="px-4 pb-4 pt-2 text-[11px] text-slate-400">Kursive Monate sind Prognosewerte (Planposten + offene Posten).</p>
          </section>
        )}

        {secSel.has("weekly") && (
          <section className="report-section card overflow-x-auto p-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">13-Wochen-Liquiditätsprognose</h2>
              <div className="text-xs text-slate-500">
                Start {data.weekly.startBalance} · Ende {data.weekly.endBalance}
                {data.weekly.low && <> · Tiefpunkt <span className={data.weekly.low.negative ? "font-semibold text-red-600" : "font-semibold"}>{data.weekly.low.value}</span> ({data.weekly.low.label})</>}
              </div>
            </div>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="px-3 py-2 text-left">Woche</th>
                  <th className="px-3 py-2 text-right">Start</th>
                  <th className="px-3 py-2 text-right">Einzahlungen</th>
                  <th className="px-3 py-2 text-right">Auszahlungen</th>
                  <th className="px-3 py-2 text-right">Ende</th>
                </tr>
              </thead>
              <tbody>
                {data.weekly.weeks.map((w) => (
                  <tr key={w.label} className={`border-b border-slate-50 ${w.below ? "bg-amber-50" : ""}`}>
                    <td className="px-3 py-1.5 text-slate-600">{w.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{w.start}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{w.inflow}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-red-600">{w.outflow}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{w.end}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 pb-4 pt-2 text-[11px] text-slate-400">Gelb hinterlegte Wochen unterschreiten den Mindestbestand.</p>
          </section>
        )}

        {secSel.has("receivables") && (
          <section className="report-section card">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Forderungen (Aging)</h2>
            <table className="w-full text-sm">
              <tbody>
                {data.receivables.buckets.map((b) => (
                  <tr key={b.label} className="border-b border-slate-50">
                    <td className="py-1 text-slate-600">{b.label}</td>
                    <td className="py-1 text-right tabular-nums">{b.amount}</td>
                    <td className="py-1 text-right text-xs text-slate-400">{b.count}</td>
                  </tr>
                ))}
                <tr className="font-semibold"><td className="py-1">Summe offen</td><td className="py-1 text-right tabular-nums">{data.receivables.totalOpen}</td><td /></tr>
                <tr><td className="py-1 text-slate-500">davon überfällig</td><td className="py-1 text-right tabular-nums text-amber-600">{data.receivables.overdueOpen}</td><td /></tr>
                <tr><td className="py-1 text-slate-500">Ø Zahlungsdauer (DSO)</td><td className="py-1 text-right">{data.receivables.dso}</td><td /></tr>
              </tbody>
            </table>
          </section>
        )}

        {secSel.has("vat") && (
          <section className="report-section card">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Steuer-Vorschau (USt)</h2>
            {data.vat.next ? (
              <p className="text-sm text-slate-700">Nächste Zahllast: <strong>{data.vat.next.payable}</strong> zum {data.vat.next.date} ({data.vat.next.label}).</p>
            ) : (
              <p className="text-sm text-slate-500">Keine offene USt-Zahllast erkannt.</p>
            )}
            <table className="mt-2 w-full text-sm">
              <tbody>
                {data.vat.periods.map((p) => (
                  <tr key={p.label} className="border-b border-slate-50">
                    <td className="py-1 text-slate-600">{p.label}</td>
                    <td className="py-1 text-right tabular-nums">{p.payable}</td>
                    <td className="py-1 text-right text-xs text-slate-400">{p.estimate ? "Schätzung" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {secSel.has("concentration") && (
          <section className="report-section card overflow-x-auto">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Klumpenrisiko (Top-Debitoren)</h2>
              <div className="text-xs text-slate-500">Top-1 {data.concentration.top1} · Top-3 {data.concentration.top3} · HHI {data.concentration.hhi}</div>
            </div>
            {data.concentration.debtors.length === 0 ? (
              <p className="text-sm text-slate-400">Keine Erlösdaten im Zeitraum.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 text-left">Auftraggeber</th>
                    <th className="py-2 text-right">Erlöse</th>
                    <th className="py-2 text-right">Anteil</th>
                  </tr>
                </thead>
                <tbody>
                  {data.concentration.debtors.map((d) => (
                    <tr key={d.name} className="border-b border-slate-50">
                      <td className="py-1 font-medium">{d.name}</td>
                      <td className="py-1 text-right tabular-nums">{d.revenue}</td>
                      <td className="py-1 text-right tabular-nums">{d.share}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {secSel.has("custom") && data.custom.length > 0 && (
          <section className="report-section">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Eigene Kennzahlen</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.custom.map((r) => (
                <CustomKpiCard key={r.id} result={r} />
              ))}
            </div>
          </section>
        )}

        {selectedKpis.length === 0 && secSel.size === 0 && (
          <p className="text-sm text-slate-400">Keine Inhalte gewählt – bitte oben Kennzahlen oder Auswertungen aktivieren.</p>
        )}
      </div>
    </div>
  );
}
