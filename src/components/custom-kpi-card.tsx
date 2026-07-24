"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents } from "@/lib/money";
import type { CustomKpiResult, TileSize } from "@/lib/custom-kpi";

// Kachelgröße -> Spaltenbreite (im 4er-Grid) + Diagrammhöhe.
const SPAN: Record<TileSize, string> = {
  sm: "sm:col-span-1 lg:col-span-1",
  md: "sm:col-span-1 lg:col-span-1",
  lg: "sm:col-span-2 lg:col-span-2",
  xl: "sm:col-span-2 lg:col-span-4",
};
const CHART_H: Record<TileSize, number> = { sm: 130, md: 170, lg: 220, xl: 300 };
const VALUE_TEXT: Record<TileSize, string> = { sm: "text-xl", md: "text-2xl", lg: "text-3xl", xl: "text-4xl" };

const PALETTE = ["#007FFF", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#ec4899", "#64748b", "#0ea5e9", "#84cc16"];

function fmt(v: number, unit: "cents" | "count"): string {
  return unit === "count" ? v.toLocaleString("de-DE") : formatCents(v);
}
const euroTick = (unit: "cents" | "count") => (v: number) =>
  unit === "count" ? String(v) : `${Math.round(v / 100).toLocaleString("de-DE")} €`;

export function spanClass(size: TileSize): string {
  return SPAN[size] ?? SPAN.md;
}

export function CustomKpiCard({
  result,
  className = "",
  embedded = false,
}: {
  result: CustomKpiResult;
  className?: string;
  embedded?: boolean;
}) {
  const span = SPAN[result.size] ?? SPAN.md;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{result.name}</div>
          <div className="text-[11px] text-slate-400">{result.metricLabel} · {result.rangeLabel}</div>
        </div>
      </div>

      {result.kind === "number" ? (
        <div className="mt-2">
          <div
            className={`font-bold text-slate-900 ${VALUE_TEXT[result.size]}`}
            title={`${result.metricLabel} (${result.rangeLabel}): ${fmt(result.value, result.unit)}`}
          >
            {fmt(result.value, result.unit)}
          </div>
          {result.delta != null && (
            <div
              className={`mt-1 text-xs font-medium ${result.delta >= 0 ? "text-emerald-600" : "text-red-600"}`}
              title={`Veränderung zur Vorperiode: ${result.delta >= 0 ? "+" : ""}${fmt(result.delta, result.unit)}`}
            >
              {result.delta >= 0 ? "▲" : "▼"} {result.delta >= 0 ? "+" : ""}{fmt(result.delta, result.unit)}
              {result.deltaPct != null && <span className="text-slate-400"> ({result.deltaPct >= 0 ? "+" : ""}{result.deltaPct} %)</span>}
              <span className="ml-1 text-slate-400">vs. Vorperiode</span>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2" style={{ height: CHART_H[result.size] }}>
          {result.points.length === 0 ? (
            <p className="text-sm text-slate-400">Keine Daten im Zeitraum.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {result.display === "pie" ? (
                <PieChart>
                  <Pie
                    data={result.points.map((p) => ({ ...p, value: Math.abs(p.value) }))}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={result.size === "sm" ? 45 : 70}
                    label={result.size === "sm" ? false : (e: { name?: string }) => e.name ?? ""}
                  >
                    {result.points.map((p, i) => (
                      <Cell key={i} fill={p.color ?? PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v, result.unit)} />
                  {result.size !== "sm" && <Legend />}
                </PieChart>
              ) : result.display === "line" ? (
                <LineChart data={result.points} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={euroTick(result.unit)} width={56} />
                  <Tooltip formatter={(v: number) => fmt(v, result.unit)} />
                  <Line type="monotone" dataKey="value" stroke="#007FFF" strokeWidth={2} dot={false} name={result.metricLabel} />
                </LineChart>
              ) : (
                <BarChart data={result.points} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={euroTick(result.unit)} width={56} />
                  <Tooltip formatter={(v: number) => fmt(v, result.unit)} />
                  <Bar dataKey="value" name={result.metricLabel} radius={[3, 3, 0, 0]}>
                    {result.points.map((p, i) => (
                      <Cell key={i} fill={p.color ?? (p.value < 0 ? "#ef4444" : "#007FFF")} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
          {result.kind === "series" && (
            <div className="mt-1 text-right text-[11px] text-slate-400" title={`Summe: ${fmt(result.total, result.unit)}`}>
              Σ {fmt(result.total, result.unit)}
            </div>
          )}
        </div>
      )}
    </>
  );

  if (embedded) return inner;
  return <div className={`card ${span} ${className} break-inside-avoid`}>{inner}</div>;
}
