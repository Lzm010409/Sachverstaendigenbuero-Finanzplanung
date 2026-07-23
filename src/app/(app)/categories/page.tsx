import Link from "next/link";
import { prisma } from "@/lib/db";
import { deleteCategory, purgeCategory, restoreCategory, toggleCategoryTransfer } from "@/app/actions/categories";
import { ApplyRulesButton, CategoryForm, ResetCategoriesButton, RuleForm, type CatOption } from "./category-forms";
import { RuleRow } from "./rule-row";
import { ConfirmSubmit } from "@/components/confirm-submit";

export const dynamic = "force-dynamic";

const RETENTION_DAYS = 30;

type CatRow = {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  color: string;
  isTransfer: boolean;
  _count: { transactions: number; budgets: number };
};

function CategoryTable({ title, rows, tone }: { title: string; rows: CatRow[]; tone: "in" | "out" }) {
  return (
    <div>
      <h3 className={`mb-2 text-xs font-semibold uppercase tracking-wide ${tone === "in" ? "text-emerald-700" : "text-red-700"}`}>
        {title} <span className="text-slate-400">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Keine {tone === "in" ? "Einnahme" : "Ausgabe"}-Kategorien.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="th">Kategorie</th>
                <th className="th text-right">Umsätze</th>
                <th className="th text-right">Budgets</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-slate-50">
                  <td className="td font-medium">
                    <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ backgroundColor: c.color }} />
                    {c.name}
                    {c.isTransfer && <span className="badge ml-2 bg-slate-100 text-slate-500">neutral · Transfer</span>}
                  </td>
                  <td className="td text-right text-slate-500">{c._count.transactions}</td>
                  <td className="td text-right text-slate-500">
                    {c._count.budgets > 0 ? (
                      <Link href="/budgets" className="text-brand hover:underline">{c._count.budgets}</Link>
                    ) : (
                      <span className="text-slate-300">–</span>
                    )}
                  </td>
                  <td className="td text-right">
                    <div className="flex items-center justify-end gap-3">
                      <form action={toggleCategoryTransfer}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="text-xs text-slate-400 hover:text-brand" title="Als neutralen Geldtransfer markieren (zählt nicht als Ein-/Ausgabe)">
                          {c.isTransfer ? "kein Transfer" : "als Transfer"}
                        </button>
                      </form>
                      <form action={deleteCategory}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="text-xs text-slate-400 hover:text-red-600" title="in den Papierkorb">
                          löschen
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function CategoriesPage() {
  const [active, trashed, rules] = await Promise.all([
    prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      include: { _count: { select: { transactions: true, budgets: true } } },
    }),
    prisma.category.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "asc" },
      include: { _count: { select: { transactions: true, budgets: true } } },
    }),
    prisma.rule.findMany({ where: { category: { deletedAt: null } }, orderBy: { priority: "asc" }, include: { category: true } }),
  ]);

  const income = active.filter((c) => c.kind === "INCOME");
  const expense = active.filter((c) => c.kind === "EXPENSE");
  const catOptions: CatOption[] = active.map((c) => ({ id: c.id, name: c.name, kind: c.kind }));
  const now = Date.now();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Kategorien &amp; Regeln</h1>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Neue Kategorie</h2>
        <CategoryForm />
      </div>

      <div className="card space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Kategorien</h2>
          <Link href="/budgets" className="text-xs text-brand hover:underline">Budgets verwalten →</Link>
        </div>
        {active.length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine Kategorien.</p>
        ) : (
          <>
            <CategoryTable title="Einnahmen" rows={income} tone="in" />
            <CategoryTable title="Ausgaben" rows={expense} tone="out" />
          </>
        )}
      </div>

      {trashed.length > 0 && (
        <div className="card">
          <h2 className="mb-1 text-sm font-semibold text-slate-700">Papierkorb</h2>
          <p className="mb-3 text-xs text-slate-400">
            Gelöschte Kategorien werden nach {RETENTION_DAYS} Tagen automatisch endgültig entfernt. Bis
            dahin wiederherstellbar. Umsätze gelöschter Kategorien gelten vorübergehend als „ohne Kategorie".
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="th">Kategorie</th>
                  <th className="th">Art</th>
                  <th className="th">verbleibend</th>
                  <th className="th text-right"></th>
                </tr>
              </thead>
              <tbody>
                {trashed.map((c) => {
                  const daysLeft = Math.max(
                    0,
                    RETENTION_DAYS - Math.floor((now - new Date(c.deletedAt!).getTime()) / 86_400_000),
                  );
                  return (
                    <tr key={c.id} className="border-b border-slate-50 opacity-70">
                      <td className="td font-medium">
                        <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </td>
                      <td className="td">{c.kind === "INCOME" ? "Einnahme" : "Ausgabe"}</td>
                      <td className="td">
                        <span className={`badge ${daysLeft <= 3 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                          noch {daysLeft} Tage
                        </span>
                      </td>
                      <td className="td">
                        <div className="flex items-center justify-end gap-4">
                          <form action={restoreCategory}>
                            <input type="hidden" name="id" value={c.id} />
                            <button className="text-xs text-brand hover:underline">wiederherstellen</button>
                          </form>
                          <ConfirmSubmit
                            action={purgeCategory}
                            hidden={{ id: c.id }}
                            confirm={`Kategorie „${c.name}" endgültig löschen? Zugehörige Regeln werden mit entfernt, Umsätze verlieren die Zuordnung.`}
                          >
                            endgültig löschen
                          </ConfirmSubmit>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Auto-Kategorisierungs-Regeln</h2>
        {active.length === 0 ? (
          <p className="text-sm text-slate-400">Zuerst eine Kategorie anlegen.</p>
        ) : (
          <div className="space-y-4">
            <RuleForm categories={catOptions} />
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
                        categories={catOptions}
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
