"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { formatCents } from "@/lib/money";

export interface CompareSeries {
  name: string;
  color: string;
  values: number[]; // Cent je Periode
}

export function ScenarioCompareChart({
  labels,
  series,
  thresholdCents,
}: {
  labels: string[];
  series: CompareSeries[];
  thresholdCents?: number;
}) {
  const data = labels.map((label, i) => {
    const row: Record<string, number | string> = { label };
    for (const s of series) row[s.name] = (s.values[i] ?? 0) / 100;
    return row;
  });

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" />
          <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} width={44} tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" />
          <Tooltip formatter={(value: number, name) => [formatCents(Math.round(value * 100)), name as string]} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {thresholdCents != null && thresholdCents > 0 && (
            <ReferenceLine y={thresholdCents / 100} stroke="#b45309" strokeDasharray="5 3" />
          )}
          {series.map((s) => (
            <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
