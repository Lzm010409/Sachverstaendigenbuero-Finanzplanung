import Link from "next/link";
import { type BudgetStatus, type BudgetStatusRow } from "@/lib/analytics";
import { formatCents } from "@/lib/money";

// Balken-/Punktfarbe je nach Art (Ausgaben: über Budget = schlecht; Einnahmen:
// Ziel erreicht = gut).
function tone(r: BudgetStatusRow): { bar: string; text: string; label: string } {
  if (r.kind === "EXPENSE") {
    if (r.status === "over") return { bar: "bg-red-500", text: "text-red-600", label: "über Budget" };
    if (r.status === "warn") return { bar: "bg-amber-500", text: "text-amber-600", label: "nah am Limit" };
    return { bar: "bg-emerald-500", text: "text-emerald-600", label: "im Rahmen" };
  }
  if (r.status === "over") return { bar: "bg-emerald-500", text: "text-emerald-600", label: "Ziel erreicht" };
  if (r.status === "warn") return { bar: "bg-amber-500", text: "text-amber-600", label: "auf Kurs" };
  return { bar: "bg-slate-400", text: "text-slate-500", label: "im Aufbau" };
}

export function BudgetStatusCard({ status }: { status: BudgetStatus }) {
  if (status.rows.length === 0) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700">Budget-Status</h2>
        <p className="mt-2 text-sm text-slate-400">
          Noch keine Budgets gepflegt.{" "}
          <Link href="/categories" className="text-brand underline">Budgets festlegen →</Link>
        </p>
      </div>
    );
  }

  const rows = status.rows.slice(0, 8);
  const totalPct = status.totalExpenseBudget > 0 ? status.totalExpenseActual / status.totalExpenseBudget : 0;

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Budget-Status · {status.monthLabel}
        </h2>
        <span className="text-xs text-slate-400">Tag {status.daysElapsed}/{status.daysInMonth}</span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        {status.overCount > 0 && (
          <span className="badge bg-red-100 text-red-700">{status.overCount} drohen zu reißen</span>
        )}
        {status.atRiskCount > 0 && (
          <span className="badge bg-amber-100 text-amber-700">{status.atRiskCount} nah am Limit</span>
        )}
        {status.overCount === 0 && status.atRiskCount === 0 && (
          <span className="badge bg-emerald-100 text-emerald-700">alle Ausgaben-Budgets im Rahmen</span>
        )}
        <span className="text-slate-500">
          Ausgaben bislang {formatCents(status.totalExpenseActual)} / {formatCents(status.totalExpenseBudget)} ({Math.round(totalPct * 100)} %)
        </span>
      </div>

      <div className="space-y-2">
        {rows.map((r) => {
          const t = tone(r);
          const barPct = Math.min(100, Math.round(r.pct * 100));
          const projMark = Math.min(100, Math.round(r.projectedPct * 100));
          return (
            <div key={r.categoryId}>
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
                {/* Marker der Monatsend-Hochrechnung */}
                <div className="absolute top-[-2px] h-3 w-0.5 bg-slate-500" style={{ left: `${projMark}%` }} title="Hochrechnung Monatsende" />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Der Strich markiert die Hochrechnung aufs Monatsende (linear nach verstrichenen Tagen).{" "}
        <Link href="/breakdown" className="text-brand underline">Details in der Auswertung →</Link>
      </p>
    </div>
  );
}
