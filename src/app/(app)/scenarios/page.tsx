import Link from "next/link";
import { prisma } from "@/lib/db";
import { deleteScenario } from "@/app/actions/scenarios";
import { ScenarioForm } from "./scenario-form";

export const dynamic = "force-dynamic";

function pct(factor: number): string {
  const diff = Math.round((factor - 1) * 100);
  if (diff === 0) return "±0 %";
  return `${diff > 0 ? "+" : ""}${diff} %`;
}

export default async function ScenariosPage() {
  const scenarios = await prisma.scenario.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Szenarien</h1>
      <p className="-mt-4 text-sm text-slate-500">
        Simuliere Best-/Worst-Case durch Faktoren auf Ein-/Auszahlungen und optionalen
        Zahlungsverzug. Ein Szenario lässt sich in der Übersicht auf die Liquiditätskurve anwenden.
      </p>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Neues Szenario</h2>
        <ScenarioForm />
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Szenarien</h2>
        {scenarios.length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine Szenarien.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="th">Name</th>
                  <th className="th">Zuflüsse</th>
                  <th className="th">Abflüsse</th>
                  <th className="th">Zahlungsverzug</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50">
                    <td className="td font-medium">{s.name}</td>
                    <td className="td">{pct(s.inflowFactor)}</td>
                    <td className="td">{pct(s.outflowFactor)}</td>
                    <td className="td">{s.inflowShiftDays} Tage</td>
                    <td className="td">
                      <div className="flex justify-end gap-3">
                        <Link href={`/?s=${s.id}`} className="text-xs text-brand hover:underline">
                          anwenden →
                        </Link>
                        <form action={deleteScenario}>
                          <input type="hidden" name="id" value={s.id} />
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
