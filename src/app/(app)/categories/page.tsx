import { prisma } from "@/lib/db";
import { deleteCategory, deleteRule } from "@/app/actions/categories";
import { ApplyRulesButton, CategoryForm, RuleForm } from "./category-forms";

export const dynamic = "force-dynamic";

const FIELD_LABEL: Record<string, string> = {
  PURPOSE: "Verwendungszweck",
  COUNTERPARTY: "Gegenpartei",
};

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
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Kategorien</h2>
        {categories.length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine Kategorien.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-2 pr-1 text-sm"
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
                <span>{c.name}</span>
                <span className="text-xs text-slate-400">
                  {c.kind === "INCOME" ? "Einnahme" : "Ausgabe"} · {c._count.transactions}
                </span>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="rounded-full px-1 text-slate-400 hover:text-red-600" title="löschen">
                    ×
                  </button>
                </form>
              </div>
            ))}
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
                      <th className="th">→ Kategorie</th>
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.id} className="border-b border-slate-50">
                        <td className="td">{r.priority}</td>
                        <td className="td">{FIELD_LABEL[r.field]}</td>
                        <td className="td font-mono text-xs">{r.pattern}</td>
                        <td className="td">{r.category.name}</td>
                        <td className="td text-right">
                          <form action={deleteRule}>
                            <input type="hidden" name="id" value={r.id} />
                            <button className="text-xs text-slate-400 hover:text-red-600">löschen</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <ApplyRulesButton />
          </div>
        )}
      </div>
    </div>
  );
}
