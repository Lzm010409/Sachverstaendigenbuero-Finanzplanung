"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { formatCents, parseAmountToCents } from "@/lib/money";
import { budgetCellColor } from "@/lib/budget-color";
import type { PlanReviewRow } from "@/lib/plan-review";
import { upsertBudgetFromReview, upsertPlannedFromReview } from "@/app/actions/plan-check";

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "neu vorschlagen", cls: "bg-amber-100 text-amber-800" },
  adjust: { label: "anpassen", cls: "bg-orange-100 text-orange-800" },
  "check-irregular": { label: "unregelmäßig", cls: "bg-slate-100 text-slate-600" },
  "check-noist": { label: "kein Ist", cls: "bg-slate-100 text-slate-600" },
  ok: { label: "ok", cls: "bg-emerald-100 text-emerald-700" },
};

function eurInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function ActionButton({
  kind,
  formAction,
  children,
}: {
  kind: "budget" | "planned";
  formAction: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={pending}
      className={`rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
        kind === "budget" ? "bg-brand text-white hover:bg-brand-hover" : "border border-brand text-brand hover:bg-brand/5"
      }`}
    >
      {children}
    </button>
  );
}

export function PlanCheckRow({ row }: { row: PlanReviewRow }) {
  const [eur, setEur] = useState(eurInput(row.suggestedAmount));
  const cents = parseAmountToCents(eur) ?? 0;
  const st = STATUS[row.status] ?? STATUS.ok;
  const isIncome = row.kind === "INCOME";
  // Farbskala Ø-Ist gegen Plan/Monat (Budget + Planposten).
  const avgBg = budgetCellColor(Math.abs(row.avg), row.plan, isIncome);

  return (
    <tr className="border-b border-slate-50 align-top">
      <td className="td font-medium">
        {row.name}
        <span className={`badge ml-2 ${st.cls}`}>{st.label}</span>
      </td>
      {row.months.map((v, i) => {
        // Jeder Monat gegen den aktuellen Monatsplan – gleiche Skala wie überall.
        const bg = v === 0 ? undefined : budgetCellColor(Math.abs(v), row.plan, isIncome);
        return (
          <td
            key={i}
            className="td whitespace-nowrap text-right tabular-nums text-slate-500"
            style={bg ? { backgroundColor: bg } : undefined}
          >
            {v === 0 ? <span className="text-slate-300">–</span> : formatCents(v)}
          </td>
        );
      })}
      <td
        className="td whitespace-nowrap text-right font-semibold tabular-nums"
        style={avgBg ? { backgroundColor: avgBg } : undefined}
        title={row.plan > 0 ? `Ø Ist ${formatCents(row.avg)} gegen Plan ${formatCents(row.plan)}` : undefined}
      >
        {formatCents(row.avg)}
      </td>
      <td className="td whitespace-nowrap text-right tabular-nums text-slate-500">
        {row.plan === 0 ? <span className="text-slate-300">–</span> : formatCents(row.plan)}
        {(row.budgetMonthly > 0 || row.plannedMonthly > 0) && (
          <span className="block text-[10px] text-slate-400">
            B {formatCents(row.budgetMonthly)} · P {formatCents(row.plannedMonthly)}
          </span>
        )}
      </td>
      <td className="td">
        <form className="flex flex-wrap items-center justify-end gap-1.5">
          <input type="hidden" name="categoryId" value={row.categoryId} />
          <input type="hidden" name="kind" value={row.kind} />
          <input type="hidden" name="name" value={row.name} />
          <input type="hidden" name="amount" value={cents} />
          <div className="relative">
            <input
              value={eur}
              onChange={(e) => setEur(e.target.value)}
              inputMode="decimal"
              className="input w-24 py-1 pr-6 text-right text-sm"
              aria-label={`Betrag für ${row.name}`}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span>
          </div>
          <ActionButton kind="budget" formAction={upsertBudgetFromReview}>Budget</ActionButton>
          <ActionButton kind="planned" formAction={upsertPlannedFromReview}>Planposten</ActionButton>
        </form>
        <p className="mt-0.5 text-right text-[10px] text-slate-400">
          {isIncome ? "Einnahme" : "Ausgabe"} · monatlich
        </p>
      </td>
    </tr>
  );
}
