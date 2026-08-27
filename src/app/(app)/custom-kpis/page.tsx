import { prisma } from "@/lib/db";
import { getCustomKpiDefs, computeCustomKpis } from "@/lib/custom-kpi";
import { KpiForm, type KpiInitial } from "./kpi-form";
import { KpiItem } from "./kpi-item";

export const dynamic = "force-dynamic";

const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export default async function CustomKpisPage() {
  const [defs, categories] = await Promise.all([
    getCustomKpiDefs(),
    prisma.category.findMany({ where: { deletedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true, parentId: true, isGroup: true } }),
  ]);
  const results = await computeCustomKpis(defs);
  const catOpts = categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, parentId: c.parentId, isGroup: c.isGroup }));

  const toInitial = (id: string): KpiInitial => {
    const d = defs.find((x) => x.id === id)!;
    return {
      id: d.id, name: d.name, metric: d.metric, categoryIds: d.categoryIds, rangeKind: d.rangeKind,
      customFrom: iso(d.customFrom), customTo: iso(d.customTo), display: d.display, groupBy: d.groupBy,
      size: d.size, compare: d.compare, showOnDashboard: d.showOnDashboard, showOnReport: d.showOnReport,
    };
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Eigene Kennzahlen</h1>
        <p className="text-sm text-slate-500">
          Baue eigene Finanzkennzahlen aus Metrik, Zeitraum, Kategorien und Darstellung (Zahl,
          Balken-, Linien- oder Kreisdiagramm). Kacheln lassen sich in der Größe anpassen, optional auf
          der Übersicht anzeigen und im Bericht drucken.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Neue Kennzahl</h2>
        <KpiForm categories={catOpts} />
      </div>

      {defs.length === 0 ? (
        <p className="text-sm text-slate-400">Noch keine eigenen Kennzahlen. Lege oben die erste an.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {results.map((r) => (
            <KpiItem key={r.id} result={r} initial={toInitial(r.id)} categories={catOpts} />
          ))}
        </div>
      )}
    </div>
  );
}
