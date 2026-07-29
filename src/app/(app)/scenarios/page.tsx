import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { CategoryOptions } from "@/components/category-select";
import {
  deleteScenario,
  deleteScenarioAdjustment,
  setScenarioAdjustment,
  toggleActiveScenario,
} from "@/app/actions/scenarios";
import { ScenarioForm } from "./scenario-form";

export const dynamic = "force-dynamic";

function pct(factor: number): string {
  const diff = Math.round((factor - 1) * 100);
  if (diff === 0) return "±0 %";
  return `${diff > 0 ? "+" : ""}${diff} %`;
}

export default async function ScenariosPage() {
  const [scenarios, categories, activeId] = await Promise.all([
    prisma.scenario.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        categoryAdjustments: { include: { category: true } },
      },
    }),
    prisma.category.findMany({ where: { deletedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    getSetting("scenario.activeId"),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Szenarien</h1>
      <p className="-mt-4 text-sm text-slate-500">
        Globale Faktoren auf Ein-/Auszahlungen und Zahlungsverzug – zusätzlich pro Kategorie fein
        justierbar. „Auf Übersicht anwenden" merkt sich das Szenario dauerhaft und passt Prognose,
        Liquiditätsverlauf und 13-Wochen-Werte an – jederzeit wieder abschaltbar.
      </p>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Neues Szenario</h2>
        <ScenarioForm />
      </div>

      {scenarios.length === 0 ? (
        <div className="card text-sm text-slate-400">Noch keine Szenarien.</div>
      ) : (
        scenarios.map((s) => {
          const isActive = activeId === s.id;
          return (
          <div key={s.id} className={`card space-y-4 ${isActive ? "ring-2 ring-brand/40" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
                  {s.name}
                  {isActive && <span className="badge bg-brand/10 text-brand">aktiv auf Übersicht</span>}
                </h3>
                <p className="text-xs text-slate-500">
                  Zuflüsse {pct(s.inflowFactor)} · Abflüsse {pct(s.outflowFactor)} · Verzug{" "}
                  {s.inflowShiftDays} Tage
                </p>
              </div>
              <div className="flex items-center gap-3">
                <form action={toggleActiveScenario} data-toast={isActive ? "Szenario entfernt" : "Szenario angewendet"}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className={`text-xs font-medium ${isActive ? "text-slate-500 hover:text-red-600" : "text-brand hover:underline"}`}>
                    {isActive ? "von Übersicht entfernen" : "auf Übersicht anwenden →"}
                  </button>
                </form>
                <form action={deleteScenario}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="text-xs text-slate-400 hover:text-red-600">Szenario löschen</button>
                </form>
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Kategoriespezifische Faktoren
              </div>
              {s.categoryAdjustments.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {s.categoryAdjustments.map((a) => (
                    <span
                      key={a.id}
                      className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-3 pr-1 text-sm"
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: a.category.color }}
                      />
                      {a.category.name}: <strong>{pct(a.factor)}</strong>
                      <form action={deleteScenarioAdjustment}>
                        <input type="hidden" name="id" value={a.id} />
                        <button className="rounded-full px-1 text-slate-400 hover:text-red-600" title="entfernen">
                          ×
                        </button>
                      </form>
                    </span>
                  ))}
                </div>
              )}
              {categories.length === 0 ? (
                <p className="text-xs text-slate-400">Zuerst Kategorien anlegen.</p>
              ) : (
                <form action={setScenarioAdjustment} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="scenarioId" value={s.id} />
                  <div className="min-w-[180px]">
                    <label className="label">Kategorie</label>
                    <select name="categoryId" className="input" required defaultValue="">
                      <option value="" disabled>
                        wählen…
                      </option>
                      <CategoryOptions categories={categories} />
                    </select>
                  </div>
                  <div className="w-28">
                    <label className="label">Faktor</label>
                    <input name="factor" className="input" placeholder="0,8" inputMode="decimal" defaultValue="1,0" />
                  </div>
                  <button className="btn-secondary" type="submit">
                    Setzen
                  </button>
                  <span className="text-xs text-slate-400">1,0 = unverändert · 0,8 = −20 % · 1,2 = +20 %</span>
                </form>
              )}
            </div>
          </div>
          );
        })
      )}
    </div>
  );
}
