"use client";

import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";

const OPTIONS: { value: string; label: string }[] = [
  { value: "week", label: "Woche" },
  { value: "month", label: "Monat" },
  { value: "year", label: "Jahr" },
];

export function GranularityToggle({ current }: { current: string }) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => {
            const next = new URLSearchParams(params);
            next.set("g", o.value);
            router.push(`?${next.toString()}`);
          }}
          className={clsx(
            "rounded-md px-3 py-1 text-sm font-medium transition",
            current === o.value ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
