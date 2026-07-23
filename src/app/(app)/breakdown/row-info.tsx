"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";

interface Period {
  key: string;
  label: string;
}

// Zeigt beim Überfahren (oder Tippen) des Kategorienamens eine Soll/Ist-
// Aufstellung je Zeitraum. Das Popover wird `position: fixed` gerendert, damit
// es nicht vom überlaufenden Tabellen-Container abgeschnitten wird.
export function BreakdownRowInfo({
  name,
  color,
  isIncome,
  periods,
  values,
  periodBudget,
  annualBudget,
  yearActual,
  budgetPct,
}: {
  name: string;
  color: string;
  isIncome: boolean;
  periods: Period[];
  values: number[];
  periodBudget: number; // Cent, positiv; 0 = kein Budget
  annualBudget: number; // Cent, positiv
  yearActual: number; // Cent, positiv (Verbrauch im Jahr)
  budgetPct: number | null;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const open = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPos({ x: r.left, y: r.bottom + 4 });
  };

  const hasBudget = annualBudget > 0;
  // Δ so, dass positiv = „schlechter": bei Ausgaben mehr als Soll, bei Einnahmen weniger.
  const deltaClass = (ist: number) => {
    if (!hasBudget) return "text-slate-400";
    const worse = isIncome ? ist < periodBudget : ist > periodBudget;
    const better = isIncome ? ist > periodBudget : ist < periodBudget;
    return worse ? "text-red-600" : better ? "text-emerald-600" : "text-slate-500";
  };
  const deltaVal = (ist: number) => {
    const d = isIncome ? ist - periodBudget : ist - periodBudget; // Rohdifferenz
    const sign = d > 0 ? "+" : "";
    return `${sign}${formatCents(d)}`;
  };

  return (
    <span className="relative">
      <button
        type="button"
        className="text-left font-medium hover:text-brand"
        onMouseEnter={(e) => open(e.currentTarget)}
        onMouseLeave={() => setPos(null)}
        onClick={(e) => (pos ? setPos(null) : open(e.currentTarget))}
      >
        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: color }} />
        {name}
      </button>

      {pos && (
        <div
          className="fixed z-50 w-[320px] rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xl"
          style={{ left: Math.min(pos.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 336), top: pos.y }}
          onMouseEnter={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-slate-700">{name}</span>
            <span className="text-slate-400">{isIncome ? "Einnahme" : "Ausgabe"}</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400">
                <th className="py-1 text-left font-medium">Zeitraum</th>
                <th className="py-1 text-right font-medium">Soll</th>
                <th className="py-1 text-right font-medium">Ist</th>
                <th className="py-1 text-right font-medium">Abw.</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p, i) => {
                const ist = Math.abs(values[i] ?? 0);
                return (
                  <tr key={p.key} className="border-b border-slate-50">
                    <td className="py-1 text-slate-600">{p.label}</td>
                    <td className="py-1 text-right tabular-nums text-slate-500">{hasBudget ? formatCents(periodBudget) : "–"}</td>
                    <td className="py-1 text-right tabular-nums">{ist === 0 ? <span className="text-slate-300">–</span> : formatCents(ist)}</td>
                    <td className={`py-1 text-right tabular-nums ${deltaClass(ist)}`}>{hasBudget ? deltaVal(ist) : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-semibold text-slate-700">
                <td className="py-1">Jahr</td>
                <td className="py-1 text-right tabular-nums">{hasBudget ? formatCents(annualBudget) : "–"}</td>
                <td className="py-1 text-right tabular-nums">{formatCents(yearActual)}</td>
                <td className="py-1 text-right tabular-nums">{budgetPct != null ? `${Math.round(budgetPct * 100)} %` : "–"}</td>
              </tr>
            </tfoot>
          </table>
          {!hasBudget && <p className="mt-2 text-[11px] text-slate-400">Kein Budget hinterlegt – „Soll" leer.</p>}
        </div>
      )}
    </span>
  );
}
