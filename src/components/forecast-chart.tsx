"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents } from "@/lib/money";

export interface ChartPoint {
  date: string;
  balance: number; // Cent
}

function formatDateLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

export function ForecastChart({ points }: { points: ChartPoint[] }) {
  const data = points.map((p) => ({ ...p, eur: p.balance / 100 }));
  const hasNegative = points.some((p) => p.balance < 0);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#007FFF" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#007FFF" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateLabel}
            minTickGap={40}
            tick={{ fontSize: 11, fill: "#64748b" }}
            stroke="#cbd5e1"
          />
          <YAxis
            tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
            width={44}
            tick={{ fontSize: 11, fill: "#64748b" }}
            stroke="#cbd5e1"
          />
          <Tooltip
            formatter={(value: number) => [formatCents(Math.round(value * 100)), "Saldo"]}
            labelFormatter={(l: string) => {
              const [y, m, d] = l.split("-");
              return `${d}.${m}.${y}`;
            }}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
          {hasNegative && <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="4 4" />}
          <Area
            type="monotone"
            dataKey="eur"
            stroke="#007FFF"
            strokeWidth={2}
            fill="url(#fill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
