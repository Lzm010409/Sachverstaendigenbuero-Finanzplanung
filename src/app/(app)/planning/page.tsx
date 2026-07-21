import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { deletePlannedItem, togglePlannedItem } from "@/app/actions/planning";
import { PlannedForm } from "./planned-form";

export const dynamic = "force-dynamic";

const RHYTHM: Record<string, string> = {
  ONCE: "einmalig",
  WEEKLY: "wöchentlich",
  MONTHLY: "monatlich",
  QUARTERLY: "quartalsweise",
  YEARLY: "jährlich",
};

export default async function PlanningPage() {
  const [items, categories] = await Promise.all([
    prisma.plannedItem.findMany({
      orderBy: [{ active: "desc" }, { startDate: "asc" }],
      include: { category: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Planung</h1>
      <p className="-mt-4 text-sm text-slate-500">
        Wiederkehrende und einmalige Ein-/Auszahlungen fließen in die Liquiditätsvorschau ein.
      </p>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Neuer Planposten</h2>
        <PlannedForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
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
                  <tr key={p.id} className={`border-b border-slate-50 ${p.active ? "" : "opacity-50"}`}>
                    <td className="td font-medium">
                      {p.name}
                      {p.category && (
                        <span className="ml-2 text-xs text-slate-400">{p.category.name}</span>
                      )}
                    </td>
                    <td className="td">
                      {RHYTHM[p.recurrence]}
                      {p.interval > 1 ? ` (×${p.interval})` : ""}
                    </td>
                    <td className="td">{new Date(p.startDate).toLocaleDateString("de-DE")}</td>
                    <td className="td">
                      {p.endDate ? new Date(p.endDate).toLocaleDateString("de-DE") : "offen"}
                    </td>
                    <td
                      className={`td text-right font-semibold ${p.amount < 0 ? "text-red-600" : "text-emerald-600"}`}
                    >
                      {formatCents(p.amount)}
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-3">
                        <form action={togglePlannedItem}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="text-xs text-slate-400 hover:text-brand">
                            {p.active ? "pausieren" : "aktivieren"}
                          </button>
                        </form>
                        <form action={deletePlannedItem}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="text-xs text-slate-400 hover:text-red-600">löschen</button>
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
    </div>
  );
}
