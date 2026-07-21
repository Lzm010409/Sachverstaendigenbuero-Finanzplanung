"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
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
  endLiquidity: number; // Cent
  isFuture: boolean;
  isCurrent: boolean;
}

export function CashflowChart({ points }: { points: CashflowChartPoint[] }) {
  const data = points.map((p) => ({
    label: p.label,
    inflow: p.inflow / 100,
    outflow: p.outflow / 100,
    liq: p.endLiquidity / 100,
    isFuture: p.isFuture,
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
            formatter={(value: number, name) => [
              formatCents(Math.round(value * 100)),
              name === "inflow" ? "Einzahlungen" : name === "outflow" ? "Auszahlungen" : "Liquidität Ende",
            ]}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
          {currentLabel && <ReferenceLine x={currentLabel} stroke="#94a3b8" strokeDasharray="4 4" />}
          <Bar dataKey="inflow" name="inflow" radius={[2, 2, 0, 0]} maxBarSize={22}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.isFuture ? "#86efac" : "#22c55e"} fillOpacity={d.isFuture ? 0.6 : 1} />
            ))}
          </Bar>
          <Bar dataKey="outflow" name="outflow" radius={[2, 2, 0, 0]} maxBarSize={22}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.isFuture ? "#fca5a5" : "#ef4444"} fillOpacity={d.isFuture ? 0.6 : 1} />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="liq"
            name="liq"
            stroke="#0f766e"
            strokeWidth={2}
            dot={{ r: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
