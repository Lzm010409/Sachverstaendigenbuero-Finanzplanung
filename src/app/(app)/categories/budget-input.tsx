"use client";

import { useState, useTransition } from "react";
import { setCategoryBudget } from "@/app/actions/categories";
import { BUDGET_PERIODS, type BudgetPeriod } from "@/lib/budget";

export function BudgetInput({
  id,
  initialAmount,
  initialPeriod,
}: {
  id: string;
  initialAmount: string;
  initialPeriod: BudgetPeriod;
}) {
  const [amount, setAmount] = useState(initialAmount);
  const [period, setPeriod] = useState<BudgetPeriod>(initialPeriod);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const save = (nextAmount = amount, nextPeriod = period) => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("amount", nextAmount);
    fd.set("budgetPeriod", nextPeriod);
    start(() => {
      setCategoryBudget(fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={() => amount !== initialAmount && save()}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        inputMode="decimal"
        placeholder="0,00"
        disabled={pending}
        className="input w-24 py-1 text-right text-sm"
        aria-label="Budgetbetrag"
      />
      <span className="text-xs text-slate-400">€</span>
      <select
        value={period}
        onChange={(e) => {
          const p = e.target.value as BudgetPeriod;
          setPeriod(p);
          if (amount.trim() !== "") save(amount, p);
        }}
        disabled={pending}
        className="input w-auto py-1 text-xs"
        aria-label="Rhythmus"
      >
        {BUDGET_PERIODS.map((p) => (
          <option key={p.value} value={p.value}>/ {p.short}</option>
        ))}
      </select>
      {saved && <span className="text-xs text-emerald-600">✓</span>}
    </span>
  );
}
