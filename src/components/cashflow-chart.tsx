"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents } from "@/lib/money";

export interface CashflowChartPoint {
  label: string;
  inflow: number; // Cent
  outflow: number; // Cent (positiv)
  inflowRealized?: number;
  inflowPlanned?: number;
  outflowRealized?: number;
  outflowPlanned?: number;
  endLiquidity: number; // Cent
  isFuture: boolean;
  isCurrent: boolean;
}

const NAME: Record<string, string> = {
  inflowRealized: "Einzahlungen (realisiert)",
  inflowPlanned: "Einzahlungen (geplant)",
  outflowRealized: "Auszahlungen (realisiert)",
  outflowPlanned: "Auszahlungen (geplant)",
  liq: "Liquidität Ende",
};

export function CashflowChart({ points, thresholdCents }: { points: CashflowChartPoint[]; thresholdCents?: number }) {
  const hasSplit = points.some((p) => p.inflowRealized != null || p.inflowPlanned != null);
  const data = points.map((p) => ({
    label: p.label,
    inflowRealized: (p.inflowRealized ?? (hasSplit ? 0 : p.inflow)) / 100,
    inflowPlanned: (p.inflowPlanned ?? 0) / 100,
    outflowRealized: (p.outflowRealized ?? (hasSplit ? 0 : p.outflow)) / 100,
    outflowPlanned: (p.outflowPlanned ?? 0) / 100,
    liq: p.endLiquidity / 100,
  }));
  const currentLabel = points.find((p) => p.isCurrent)?.label;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" />
          <YAxis
            tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
            width={44}
            tick={{ fontSize: 11, fill: "#64748b" }}
            stroke="#cbd5e1"
          />
          <Tooltip
            formatter={(value: number, name) => [formatCents(Math.round(value * 100)), NAME[name as string] ?? name]}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
          {currentLabel && <ReferenceLine x={currentLabel} stroke="#94a3b8" strokeDasharray="4 4" />}
          {thresholdCents != null && thresholdCents > 0 && (
            <ReferenceLine
              y={thresholdCents / 100}
              stroke="#b45309"
              strokeDasharray="5 3"
              label={{ value: "Mindestliquidität", position: "insideTopRight", fontSize: 10, fill: "#b45309" }}
            />
          )}
          {/* Einzahlungen: realisiert (kräftig) + geplant (hell) gestapelt */}
          <Bar dataKey="inflowRealized" name="inflowRealized" stackId="in" radius={[0, 0, 0, 0]} maxBarSize={22} fill="#22c55e" />
          <Bar dataKey="inflowPlanned" name="inflowPlanned" stackId="in" radius={[2, 2, 0, 0]} maxBarSize={22} fill="#86efac" fillOpacity={0.7} />
          {/* Auszahlungen */}
          <Bar dataKey="outflowRealized" name="outflowRealized" stackId="out" radius={[0, 0, 0, 0]} maxBarSize={22} fill="#ef4444" />
          <Bar dataKey="outflowPlanned" name="outflowPlanned" stackId="out" radius={[2, 2, 0, 0]} maxBarSize={22} fill="#fca5a5" fillOpacity={0.7} />
          <Line type="monotone" dataKey="liq" name="liq" stroke="#0f766e" strokeWidth={2} dot={{ r: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
