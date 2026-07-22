import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { periodShort, budgetAnnualCents, type BudgetPeriod } from "@/lib/budget";
import { deleteBudget, purgeBudget, restoreBudget, toggleBudgetActive } from "@/app/actions/budgets";
import { ConfirmSubmit } from "@/components/confirm-submit";
import type { CatOption } from "../categories/category-forms";
import { BudgetForm, BudgetRow, DeleteBudgetButton, type BudgetView } from "./budget-forms";

export const dynamic = "force-dynamic";

const RETENTION_DAYS = 30;

function isoDay(d: Date | null): string | null {
  return d ? new Date(d).toISOString().slice(0, 10) : null;
}
function fmtRange(start: Date | null, end: Date | null): string {
  const f = (d: Date) => new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "2-digit" });
  if (!start && !end) return "unbefristet";
  if (start && end) return `${f(start)} – ${f(end)}`;
  if (start) return `ab ${f(start)}`;
  return `bis ${f(end!)}`;
}

type Row = {
  id: string;
  title: string;
  kind: "INCOME" | "EXPENSE";
  amount: number;
  period: BudgetPeriod;
  categoryId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  note: string | null;
  active: boolean;
  includeInForecast: boolean;
  category: { name: string; color: string } | null;
};

function toView(b: Row): BudgetView {
  return {
    id: b.id, title: b.title, kind: b.kind, amount: b.amount, period: b.period,
    categoryId: b.categoryId, startDate: isoDay(b.startDate), endDate: isoDay(b.endDate),
    note: b.note, active: b.active, includeInForecast: b.includeInForecast,
  };
}

function BudgetTable({ title, rows, categories, tone }: { title: string; rows: Row[]; categories: CatOption[]; tone: "in" | "out" }) {
  return (
    <div>
      <h3 className={`mb-2 text-xs font-semibold uppercase tracking-wide ${tone === "in" ? "text-emerald-700" : "text-red-700"}`}>
        {title} <span className="text-slate-400">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Keine {tone === "in" ? "Einnahme" : "Ausgabe"}-Budgets.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((b) => (
            <div key={b.id} className={`rounded-md border border-slate-200 p-3 ${b.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    {b.title}
                    {b.category ? (
                      <span className="badge bg-slate-100 text-slate-600">
                        <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: b.category.color }} />
                        {b.category.name}
                      </span>
                    ) : (
                      <span className="badge bg-slate-50 text-slate-400">ohne Kategorie</span>
                    )}
                    {b.includeInForecast && <span className="badge bg-primary-subtle text-brand-fg">in Prognose</span>}
                    {!b.active && <span className="badge bg-amber-100 text-amber-700">inaktiv</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {formatCents(b.amount)} / {periodShort(b.period)} · {formatCents(budgetAnnualCents(b.amount, b.period))} p.a. · {fmtRange(b.startDate, b.endDate)}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <form action={toggleBudgetActive}>
                    <input type="hidden" name="id" value={b.id} />
                    <button className="text-slate-400 hover:text-brand">{b.active ? "deaktivieren" : "aktivieren"}</button>
                  </form>
                  <DeleteBudgetButton action={deleteBudget} id={b.id} confirm={`Budget „${b.title}" in den Papierkorb legen?`}>
                    löschen
                  </DeleteBudgetButton>
                </div>
              </div>
              <div className="mt-2 border-t border-slate-100 pt-2">
                <BudgetRow budget={toView(b)} categories={categories} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function BudgetsPage() {
  const [active, trashed, cats] = await Promise.all([
    prisma.budget.findMany({
      where: { deletedAt: null },
      orderBy: [{ kind: "asc" }, { title: "asc" }],
      include: { category: { select: { name: true, color: true } } },
    }),
    prisma.budget.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "asc" },
      include: { category: { select: { name: true, color: true } } },
    }),
    prisma.category.findMany({ where: { deletedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
  ]);

  const categories: CatOption[] = cats.map((c) => ({ id: c.id, name: c.name, kind: c.kind }));
  const income = (active as Row[]).filter((b) => b.kind === "INCOME");
  const expense = (active as Row[]).filter((b) => b.kind === "EXPENSE");
  const now = Date.now();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Budgets &amp; geplante Ausgaben</h1>
        <p className="text-sm text-slate-500">
          Budgets sind eigenständig – mit Titel, Betrag, Rhythmus und optionalem Zeitraum. Die
          Verknüpfung zu einer Kategorie ist optional; mehrere Budgets je Kategorie werden addiert.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Neues Budget</h2>
        <BudgetForm categories={categories} />
      </div>

      <div className="card space-y-6">
        <h2 className="text-sm font-semibold text-slate-700">Bestehende Budgets</h2>
        {active.length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine Budgets angelegt.</p>
        ) : (
          <>
            <BudgetTable title="Einnahmen-Budgets" rows={income} categories={categories} tone="in" />
            <BudgetTable title="Ausgaben-Budgets" rows={expense} categories={categories} tone="out" />
          </>
        )}
      </div>

      {trashed.length > 0 && (
        <div className="card">
          <h2 className="mb-1 text-sm font-semibold text-slate-700">Papierkorb</h2>
          <p className="mb-3 text-xs text-slate-400">
            Gelöschte Budgets werden nach {RETENTION_DAYS} Tagen endgültig entfernt.
          </p>
          <div className="space-y-2">
            {(trashed as Row[]).map((b) => {
              const daysLeft = Math.max(0, RETENTION_DAYS - Math.floor((now - new Date((b as unknown as { deletedAt: Date }).deletedAt).getTime()) / 86_400_000));
              return (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 p-2 opacity-70">
                  <span className="text-sm text-slate-600">
                    {b.title} · {formatCents(b.amount)} / {periodShort(b.period)}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className={`badge ${daysLeft <= 3 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                      noch {daysLeft} Tage
                    </span>
                    <form action={restoreBudget}>
                      <input type="hidden" name="id" value={b.id} />
                      <button className="text-xs text-brand hover:underline">wiederherstellen</button>
                    </form>
                    <ConfirmSubmit action={purgeBudget} hidden={{ id: b.id }} confirm={`Budget „${b.title}" endgültig löschen?`}>
                      endgültig löschen
                    </ConfirmSubmit>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
