"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: 30, label: "30 Tage" },
  { value: 90, label: "90 Tage" },
  { value: 180, label: "6 Monate" },
  { value: 365, label: "12 Monate" },
];

export function HorizonSelect({ current }: { current: number }) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <select
      className="input w-auto"
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        next.set("h", e.target.value);
        router.push(`?${next.toString()}`);
      }}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
