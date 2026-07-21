"use client";

import { useState, useTransition } from "react";
import { setCategoryBudget } from "@/app/actions/categories";

export function BudgetInput({ id, initial }: { id: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const save = () => {
    if (value === initial) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("annualBudget", value);
    start(() => {
      setCategoryBudget(fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        inputMode="decimal"
        placeholder="0,00"
        disabled={pending}
        className="input w-28 py-1 text-right text-sm"
      />
      <span className="text-xs text-slate-400">€/Jahr {saved ? "✓" : ""}</span>
    </span>
  );
}
