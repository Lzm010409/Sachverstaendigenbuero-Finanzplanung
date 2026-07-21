import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  deleteScenario,
  deleteScenarioAdjustment,
  setScenarioAdjustment,
} from "@/app/actions/scenarios";
import { ScenarioForm } from "./scenario-form";

export const dynamic = "force-dynamic";

function pct(factor: number): string {
  const diff = Math.round((factor - 1) * 100);
  if (diff === 0) return "±0 %";
  return `${diff > 0 ? "+" : ""}${diff} %`;
}

export default async function ScenariosPage() {
  const [scenarios, categories] = await Promise.all([
    prisma.scenario.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        categoryAdjustments: { include: { category: true } },
      },
    }),
    prisma.category.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Szenarien</h1>
      <p className="-mt-4 text-sm text-slate-500">
        Globale Faktoren auf Ein-/Auszahlungen und Zahlungsverzug – zusätzlich pro Kategorie fein
        justierbar. Ein Szenario lässt sich in der Übersicht auf die Liquiditätskurve anwenden.
      </p>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Neues Szenario</h2>
        <ScenarioForm />
      </div>

      {scenarios.length === 0 ? (
        <div className="card text-sm text-slate-400">Noch keine Szenarien.</div>
      ) : (
        scenarios.map((s) => (
          <div key={s.id} className="card space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-800">{s.name}</h3>
                <p className="text-xs text-slate-500">
                  Zuflüsse {pct(s.inflowFactor)} · Abflüsse {pct(s.outflowFactor)} · Verzug{" "}
                  {s.inflowShiftDays} Tage
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/?s=${s.id}`} className="text-xs font-medium text-brand hover:underline">
                  auf Übersicht anwenden →
                </Link>
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
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
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
        ))
      )}
    </div>
  );
}
