import Link from "next/link";
import { getAccountsWithBalance, getForecast, getTotalBalanceCents } from "@/lib/queries";
import { getKpis } from "@/lib/analytics";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/db";
import { ForecastChart } from "@/components/forecast-chart";
import { HorizonSelect } from "@/components/horizon-select";
import { ScenarioSelect } from "@/components/scenario-select";

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative" | "warning";
}) {
  const toneClass =
    tone === "negative"
      ? "text-red-600"
      : tone === "positive"
        ? "text-emerald-600"
        : tone === "warning"
          ? "text-amber-600"
          : "text-slate-900";
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string; s?: string }>;
}) {
  const params = await searchParams;
  const horizon = Math.min(Math.max(Number(params.h) || 90, 7), 365);
  const scenarioId = params.s || "";

  const [total, forecast, accounts, plannedCount, upcoming, scenarios, activeScenario, kpis] =
    await Promise.all([
      getTotalBalanceCents(),
      getForecast(horizon, scenarioId || undefined),
      getAccountsWithBalance(),
      prisma.plannedItem.count({ where: { active: true } }),
      prisma.plannedItem.findMany({
        where: { active: true },
        orderBy: { startDate: "asc" },
        take: 6,
        include: { category: true },
      }),
      prisma.scenario.findMany({ orderBy: { createdAt: "asc" } }),
      scenarioId ? prisma.scenario.findUnique({ where: { id: scenarioId } }) : Promise.resolve(null),
      getKpis(),
    ]);

  const exportQuery = new URLSearchParams({ h: String(horizon) });
  if (scenarioId) exportQuery.set("s", scenarioId);

  const lowestDate = new Date(forecast.lowest.date).toLocaleDateString("de-DE");
  const lowNegative = forecast.lowest.balance < 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Übersicht</h1>
          <p className="text-sm text-slate-500">
            Liquiditätsvorschau der nächsten {horizon} Tage
            {activeScenario && (
              <span className="ml-2 badge bg-amber-100 text-amber-700">
                Szenario: {activeScenario.name}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScenarioSelect
            scenarios={scenarios.map((s) => ({ id: s.id, name: s.name }))}
            current={scenarioId}
          />
          <HorizonSelect current={horizon} />
          <a className="btn-secondary" href={`/api/export/forecast?${exportQuery.toString()}`}>
            ⬇ CSV
          </a>
        </div>
      </div>

      {accounts.length === 0 && (
        <div className="card border-brand/30 bg-brand/5">
          <p className="text-sm text-slate-700">
            Noch keine Konten angelegt. Leg zuerst ein{" "}
            <Link href="/accounts" className="font-semibold text-brand underline">
              Konto
            </Link>{" "}
            an und importiere Umsätze unter{" "}
            <Link href="/import" className="font-semibold text-brand underline">
              Import
            </Link>
            .
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Aktueller Saldo"
          value={formatCents(total)}
          tone={total < 0 ? "negative" : "default"}
          hint={`${accounts.length} Konto/Konten`}
        />
        <Stat
          label="Tiefster Stand"
          value={formatCents(forecast.lowest.balance)}
          tone={lowNegative ? "negative" : "warning"}
          hint={`am ${lowestDate}`}
        />
        <Stat
          label="Geplante Zuflüsse"
          value={formatCents(forecast.totalInflow)}
          tone="positive"
          hint={`über ${horizon} Tage`}
        />
        <Stat
          label="Geplante Abflüsse"
          value={formatCents(forecast.totalOutflow)}
          tone="default"
          hint={`${plannedCount} aktive Planposten`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Ø Einnahmen / Monat" value={formatCents(kpis.avgMonthlyIncome)} tone="positive" hint="letzte 3 Monate" />
        <Stat label="Ø Ausgaben / Monat" value={formatCents(-kpis.avgMonthlyExpense)} hint="letzte 3 Monate" />
        <Stat
          label="Netto / Monat"
          value={formatCents(kpis.netMonthly)}
          tone={kpis.netMonthly < 0 ? "negative" : "positive"}
          hint={kpis.netMonthly < 0 ? "Liquidität wird verbraucht" : "Überschuss"}
        />
        <Stat
          label="Reichweite"
          value={kpis.runwayMonths == null ? "∞" : `${kpis.runwayMonths} Mon.`}
          tone={kpis.runwayMonths != null && kpis.runwayMonths < 6 ? "warning" : "default"}
          hint={kpis.runwayMonths == null ? "kein Netto-Verbrauch" : "bei aktuellem Burn"}
        />
        <Stat
          label="Working Capital"
          value={formatCents(kpis.workingCapital)}
          tone={kpis.workingCapital < 0 ? "negative" : "default"}
          hint="Saldo + Ford. − Verb."
        />
      </div>

      {lowNegative && (
        <div className="card flex items-start gap-3 border-red-200 bg-red-50">
          <span className="text-xl">⚠️</span>
          <div className="text-sm text-red-800">
            <strong>Liquiditätswarnung:</strong> Der prognostizierte Saldo unterschreitet am{" "}
            {lowestDate} mit {formatCents(forecast.lowest.balance)} die Nulllinie. Prüfe geplante
            Ausgaben oder plane Zuflüsse ein.
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Liquiditätskurve</h2>
        <ForecastChart points={forecast.points.map((p) => ({ date: p.date, balance: p.balance }))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Konten</h2>
            <Link href="/accounts" className="text-xs font-medium text-brand hover:underline">
              Verwalten →
            </Link>
          </div>
          {accounts.length === 0 ? (
            <p className="text-sm text-slate-400">Keine Konten.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{a.name}</div>
                    <div className="text-xs text-slate-400">{a.txCount} Umsätze</div>
                  </div>
                  <div
                    className={`text-sm font-semibold ${a.currentBalance < 0 ? "text-red-600" : "text-slate-800"}`}
                  >
                    {formatCents(a.currentBalance)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Nächste Planposten</h2>
            <Link href="/planning" className="text-xs font-medium text-brand hover:underline">
              Verwalten →
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-400">Keine Planposten.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{p.name}</div>
                    <div className="text-xs text-slate-400">
                      {p.recurrence === "ONCE" ? "einmalig" : p.recurrence.toLowerCase()} · ab{" "}
                      {new Date(p.startDate).toLocaleDateString("de-DE")}
                    </div>
                  </div>
                  <div
                    className={`text-sm font-semibold ${p.amount < 0 ? "text-red-600" : "text-emerald-600"}`}
                  >
                    {formatCents(p.amount)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
