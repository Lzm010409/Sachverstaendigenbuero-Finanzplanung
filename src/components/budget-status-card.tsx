"use client";

import Link from "next/link";
import { useState } from "react";
import { type BudgetStatus, type BudgetStatusRow } from "@/lib/analytics";
import { formatCents } from "@/lib/money";
import { GroupSection, Chevron } from "@/components/category-group";
import { groupRowsByCategoryGroup, sumBy } from "@/lib/category-tree";

// Balken-/Punktfarbe je nach Art (Ausgaben: über Budget = schlecht; Einnahmen:
// Ziel erreicht = gut).
function tone(r: BudgetStatusRow): { bar: string; text: string } {
  if (r.kind === "EXPENSE") {
    if (r.status === "over") return { bar: "bg-red-500", text: "text-red-600" };
    if (r.status === "warn") return { bar: "bg-amber-500", text: "text-amber-600" };
    return { bar: "bg-emerald-500", text: "text-emerald-600" };
  }
  if (r.status === "over") return { bar: "bg-emerald-500", text: "text-emerald-600" };
  if (r.status === "warn") return { bar: "bg-amber-500", text: "text-amber-600" };
  return { bar: "bg-slate-400", text: "text-slate-500" };
}

const INITIAL = 8;

const STORE_KEY = "cat:open:budget-status";

/** Ein Budget-Balken für eine Kategorie. */
function BudgetBar({ r }: { r: BudgetStatusRow }) {
  const t = tone(r);
  const barPct = Math.min(100, Math.round(r.pct * 100));
  const projMark = Math.min(100, Math.round(r.projectedPct * 100));
  return (
    <div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-slate-700">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                  {r.name}
                </span>
                <span className={t.text}>
                  {formatCents(r.actual)} / {formatCents(r.monthlyBudget)} · {Math.round(r.pct * 100)} %
                  <span className="ml-1 text-slate-400">(Hochr. {Math.round(r.projectedPct * 100)} %)</span>
                </span>
              </div>
              <div className="relative mt-1 h-2 w-full rounded bg-slate-100">
                <div className={`h-2 rounded ${t.bar}`} style={{ width: `${barPct}%` }} />
      <div className="absolute top-[-2px] h-3 w-0.5 bg-slate-500" style={{ left: `${projMark}%` }} title="Hochrechnung Monatsende" />
      </div>
    </div>
  );
}

export function BudgetStatusCard({
  status,
  prevHref,
  nextHref,
  canNext,
}: {
  status: BudgetStatus;
  prevHref: string;
  nextHref: string;
  canNext: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const nav = (
    <div className="flex items-center gap-1">
      <Link href={prevHref} className="btn-secondary px-2 py-0.5 text-sm" title="Vormonat">←</Link>
      <span className="min-w-[8rem] text-center text-sm font-medium text-slate-700">{status.monthLabel}</span>
      {canNext ? (
        <Link href={nextHref} className="btn-secondary px-2 py-0.5 text-sm" title="Folgemonat">→</Link>
      ) : (
        <span className="btn-secondary cursor-not-allowed px-2 py-0.5 text-sm opacity-40">→</span>
      )}
    </div>
  );

  if (status.rows.length === 0) {
    return (
      <div className="card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Budget-Status</h2>
          {nav}
        </div>
        <p className="mt-2 text-sm text-slate-400">
          Keine Budgets für diesen Monat.{" "}
          <Link href="/budgets" className="text-brand underline">Budgets festlegen →</Link>
        </p>
      </div>
    );
  }

  const totalPct = status.totalExpenseBudget > 0 ? status.totalExpenseActual / status.totalExpenseBudget : 0;
  const rows = showAll ? status.rows : status.rows.slice(0, INITIAL);
  // Budget-Balken nach Überkategorie bündeln; die Kopfzeile trägt die Summe.
  const grouped = groupRowsByCategoryGroup(rows, (r) => r.categoryId, [
    ...rows.map((r) => ({
      id: r.categoryId, name: r.name, kind: r.kind, color: r.color,
      parentId: r.parentId ?? null, isGroup: false,
    })),
    ...status.groups,
  ]);

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">Budget-Status</h2>
        <div className="flex items-center gap-3">
          {nav}
          <span className="text-xs text-slate-400">Tag {status.daysElapsed}/{status.daysInMonth}</span>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        {status.overCount > 0 && <span className="badge bg-red-100 text-red-700">{status.overCount} drohen zu reißen</span>}
        {status.atRiskCount > 0 && <span className="badge bg-amber-100 text-amber-700">{status.atRiskCount} nah am Limit</span>}
        {status.overCount === 0 && status.atRiskCount === 0 && (
          <span className="badge bg-emerald-100 text-emerald-700">alle Ausgaben-Budgets im Rahmen</span>
        )}
        <span className="text-slate-500">
          Ausgaben bislang {formatCents(status.totalExpenseActual)} / {formatCents(status.totalExpenseBudget)} ({Math.round(totalPct * 100)} %)
        </span>
      </div>

      <div className="space-y-2">
        {grouped.map((g) => {
          const bars = g.rows.map((r) => <BudgetBar key={r.categoryId} r={r} />);
          if (!g.group) return <div key="ohne" className="space-y-2">{bars}</div>;
          const gBudget = sumBy(g.rows, (r) => r.monthlyBudget);
          const gActual = sumBy(g.rows, (r) => r.actual);
          const gPct = gBudget > 0 ? gActual / gBudget : 0;
          return (
            <GroupSection
              key={g.group.id}
              storeKey={STORE_KEY}
              groupId={g.group.id}
              className="rounded-md border border-slate-100 p-2"
              header={
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-semibold text-slate-700">
                    <Chevron />
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: g.group.color }}
                    />
                    {g.group.name}
                    <span className="font-normal text-slate-400">({g.rows.length})</span>
                  </span>
                  <span className="font-semibold text-slate-700">
                    {formatCents(gActual)} / {formatCents(gBudget)} · {Math.round(gPct * 100)} %
                  </span>
                </div>
              }
            >
              <div className="mt-2 space-y-2 pl-4">{bars}</div>
            </GroupSection>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between">
        {status.rows.length > INITIAL ? (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="text-xs text-brand hover:underline">
            {showAll ? "weniger anzeigen" : `alle ${status.rows.length} Budgets anzeigen`}
          </button>
        ) : (
          <span />
        )}
        <Link href="/breakdown" className="text-xs text-brand hover:underline">Details in der Auswertung →</Link>
      </div>
    </div>
  );
}
