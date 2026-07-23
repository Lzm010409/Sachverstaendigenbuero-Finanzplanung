import { prisma } from "@/lib/db";
import { PlannedForm } from "./planned-form";
import { PlannedRow } from "./planned-row";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const [items, categories] = await Promise.all([
    prisma.plannedItem.findMany({
      orderBy: [{ active: "desc" }, { startDate: "asc" }],
      include: { category: true },
    }),
    prisma.category.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Planung</h1>
      <p className="-mt-4 text-sm text-slate-500">
        Wiederkehrende und einmalige Ein-/Auszahlungen fließen in die Liquiditätsvorschau ein.
      </p>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Neuer Planposten</h2>
        <PlannedForm categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))} />
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Planposten</h2>
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine Planposten.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="th">Bezeichnung</th>
                  <th className="th">Rhythmus</th>
                  <th className="th">Ab</th>
                  <th className="th">Bis</th>
                  <th className="th text-right">Betrag</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <PlannedRow
                    key={p.id}
                    item={{
                      id: p.id,
                      name: p.name,
                      amount: p.amount,
                      recurrence: p.recurrence,
                      interval: p.interval,
                      startDate: p.startDate.toISOString(),
                      endDate: p.endDate ? p.endDate.toISOString() : null,
                      categoryId: p.categoryId,
                      categoryName: p.category?.name ?? null,
                      active: p.active,
                    }}
                    categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
