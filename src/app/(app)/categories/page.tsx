import { prisma } from "@/lib/db";
import { deleteCategory } from "@/app/actions/categories";
import { ApplyRulesButton, CategoryForm, ResetCategoriesButton, RuleForm } from "./category-forms";
import { RuleRow } from "./rule-row";
import { BudgetInput } from "./budget-input";

function budgetToInput(cents: number): string {
  return cents > 0 ? (cents / 100).toFixed(2).replace(".", ",") : "";
}

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const [categories, rules] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      include: { _count: { select: { transactions: true } } },
    }),
    prisma.rule.findMany({ orderBy: { priority: "asc" }, include: { category: true } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Kategorien &amp; Regeln</h1>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Neue Kategorie</h2>
        <CategoryForm />
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Kategorien &amp; Budgets</h2>
        {categories.length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine Kategorien.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="th">Kategorie</th>
                  <th className="th">Art</th>
                  <th className="th">Umsätze</th>
                  <th className="th text-right">Jahresbudget</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50">
                    <td className="td font-medium">
                      <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </td>
                    <td className="td">{c.kind === "INCOME" ? "Einnahme" : "Ausgabe"}</td>
                    <td className="td">{c._count.transactions}</td>
                    <td className="td text-right">
                      <BudgetInput id={c.id} initial={budgetToInput(c.annualBudget)} />
                    </td>
                    <td className="td text-right">
                      <form action={deleteCategory}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="text-xs text-slate-400 hover:text-red-600" title="löschen">
                          löschen
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Auto-Kategorisierungs-Regeln</h2>
        {categories.length === 0 ? (
          <p className="text-sm text-slate-400">Zuerst eine Kategorie anlegen.</p>
        ) : (
          <div className="space-y-4">
            <RuleForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
            {rules.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="th">Prio</th>
                      <th className="th">Feld</th>
                      <th className="th">Muster</th>
                      <th className="th">Betrag</th>
                      <th className="th">→ Kategorie</th>
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <RuleRow
                        key={r.id}
                        rule={{
                          id: r.id,
                          field: r.field,
                          pattern: r.pattern,
                          amountOp: r.amountOp,
                          amountValue: r.amountValue,
                          priority: r.priority,
                          active: r.active,
                          categoryId: r.categoryId,
                          categoryName: r.category.name,
                        }}
                        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <ApplyRulesButton />
            <div className="border-t border-slate-100 pt-3">
              <ResetCategoriesButton />
              <p className="mt-1 text-xs text-slate-400">
                Setzt die Kategorie aller Umsätze zurück (die Umsätze bleiben erhalten). Einzelne
                Umsätze kannst du auf der Seite <strong>Umsätze</strong> direkt umkategorisieren.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
