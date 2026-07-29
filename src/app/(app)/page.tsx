import Link from "next/link";
import { prisma } from "@/lib/db";
import { getBudgetStatus, getCashflowMatrix, type CashflowMonth } from "@/lib/analytics";
import { getForecast } from "@/lib/queries";
import { getDashboardKpis, DEFAULT_KPI_IDS } from "@/lib/dashboard-kpis";
import { getPlanningSettings, findThresholdBreach } from "@/lib/planning";
import { getSetting } from "@/lib/settings";
import { clearActiveScenario } from "@/app/actions/scenarios";
import { formatCents } from "@/lib/money";
import { CashflowChart } from "@/components/cashflow-chart";
import { BudgetStatusCard } from "@/components/budget-status-card";
import { KpiGrid } from "@/components/kpi-grid";
import { CustomKpiCard } from "@/components/custom-kpi-card";
import { getCustomKpiDefs, computeCustomKpis } from "@/lib/custom-kpi";
import { PivotSections } from "./pivot-sections";

export const dynamic = "force-dynamic";

function eur(cents: number): string {
  if (cents === 0) return "–";
  return (cents / 100).toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €";
}

function SummaryRow({
  label,
  values,
  months,
  strong,
  tone,
  muted,
}: {
  label: string;
  values: number[];
  months: CashflowMonth[];
  strong?: boolean;
  tone?: "in" | "out";
  muted?: boolean;
}) {
  return (
    <tr className={strong ? "bg-slate-50" : ""}>
      <td className={`sticky left-0 z-10 px-3 py-1.5 text-sm ${strong ? "bg-slate-50 font-semibold text-slate-800" : muted ? "bg-white pl-6 italic text-slate-400" : "bg-white text-slate-600"}`}>
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={months[i].key}
          className={`whitespace-nowrap px-3 py-1.5 text-right text-sm tabular-nums ${strong ? "font-semibold" : ""} ${muted ? "italic opacity-70" : ""} ${v < 0 ? "text-red-600" : tone === "in" ? "text-emerald-700" : "text-slate-800"} ${months[i].isCurrent ? "bg-brand/10" : strong ? "bg-slate-50" : ""}`}
        >
          {v === 0 ? <span className="text-slate-300">–</span> : eur(v)}
        </td>
      ))}
      <td className={`px-3 py-1.5 ${strong ? "bg-slate-50" : "bg-white"}`} />
    </tr>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string; bm?: string; s?: string }>;
}) {
  const sp = await searchParams;
  const offset = Math.max(0, Number(sp.offset) || 0);
  const bm = Math.min(0, Math.max(-24, Number(sp.bm) || 0)); // Budget-Monat (0 = aktuell, negativ = zurück)
  // Aktives Szenario: ?s= (Vorschau) hat Vorrang, sonst das persistierte.
  // Die Übersicht bleibt auf Basiswerten; das Szenario läuft als Vergleichs-
  // linie im Graphen mit.
  const activeSetting = (await getSetting("scenario.activeId")) || undefined;
  const scenarioId = sp.s || activeSetting || undefined;
  const [kpiList, matrix, forecast, planning, budgetStatus, activeScenario] = await Promise.all([
    getDashboardKpis(),
    getCashflowMatrix(6, 6, offset),
    getForecast(180),
    getPlanningSettings(),
    getBudgetStatus(bm),
    scenarioId ? prisma.scenario.findUnique({ where: { id: scenarioId }, select: { id: true, name: true } }) : Promise.resolve(null),
  ]);
  const { months } = matrix;
  // Szenario-Liquiditätskurve (nur die End-Liquidität je Monat) für die
  // Vergleichslinie – nur berechnen, wenn das Szenario noch existiert.
  const scenarioMatrix = activeScenario ? await getCashflowMatrix(6, 6, offset, activeScenario.id) : null;

  // Eigene Kennzahlen, die für die Übersicht markiert sind.
  const customDefs = await getCustomKpiDefs({ showOnDashboard: true });
  const customResults = customDefs.length ? await computeCustomKpis(customDefs) : [];

  // Budget-Monats-Navigation (behält den Cashflow-Offset bei).
  const bmQs = (o: number) => {
    const p = new URLSearchParams();
    if (offset > 0) p.set("offset", String(offset));
    if (o !== 0) p.set("bm", String(o));
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };
  const breach = findThresholdBreach(forecast, planning.minLiquidityCents);
  const rangeLabel = `${months[0]?.label} – ${months[months.length - 1]?.label}`;
  const qs = (o: number) => (o > 0 ? `/?offset=${o}` : "/");

  const lowestFuture = months
    .filter((m) => m.isFuture || m.isCurrent)
    .reduce<CashflowMonth | null>((min, m) => (!min || m.endLiquidity < min.endLiquidity ? m : min), null);
  const warnNegative = lowestFuture && lowestFuture.endLiquidity < 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Übersicht</h1>
          <p className="text-sm text-slate-500">Liquidität, Ein- und Auszahlungen je Monat</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Link href={qs(offset + 6)} className="btn-secondary px-2 py-1 text-sm" title="6 Monate früher">◄</Link>
            <span className="min-w-[150px] text-center text-sm text-slate-600">{rangeLabel}</span>
            {offset > 0 ? (
              <Link href={qs(Math.max(0, offset - 6))} className="btn-secondary px-2 py-1 text-sm" title="6 Monate später">►</Link>
            ) : (
              <span className="btn-secondary cursor-not-allowed px-2 py-1 text-sm opacity-40">►</span>
            )}
            {offset > 0 && <Link href="/" className="ml-1 text-xs text-brand hover:underline">heute</Link>}
          </div>
          <Link href="/scenarios" className="text-sm font-medium text-brand hover:underline">
            Szenarien →
          </Link>
        </div>
      </div>

      {activeScenario && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-brand/30 bg-brand/5">
          <div className="text-sm text-slate-700">
            <span className="mr-2">🎚️</span>
            Szenario <strong>„{activeScenario.name}"</strong> läuft als <span className="font-medium text-violet-600">Vergleichslinie</span> im
            Liquiditätsgraphen mit. Die übrigen Werte bleiben Basiswerte.
          </div>
          <form action={clearActiveScenario}>
            <button className="btn-secondary px-3 py-1 text-sm">Szenario entfernen</button>
          </form>
        </div>
      )}

      <KpiGrid kpis={kpiList} defaultIds={DEFAULT_KPI_IDS} />

      {customResults.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Eigene Kennzahlen</h2>
            <Link href="/custom-kpis" className="text-xs text-brand hover:underline">verwalten →</Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {customResults.map((r) => (
              <CustomKpiCard key={r.id} result={r} detailHref={`/custom-kpis/${r.id}`} />
            ))}
          </div>
        </div>
      )}

      {warnNegative && lowestFuture && (
        <div className="card flex items-start gap-3 border-red-200 bg-red-50">
          <span className="text-xl">⚠️</span>
          <div className="text-sm text-red-800">
            <strong>Liquiditätswarnung:</strong> Im {lowestFuture.label} sinkt die prognostizierte
            Liquidität auf {formatCents(lowestFuture.endLiquidity)}.
          </div>
        </div>
      )}

      {breach && (
        <div className="card flex items-start gap-3 border-amber-200 bg-amber-50">
          <span className="text-xl">🔔</span>
          <div className="text-sm text-amber-800">
            <strong>Mindestliquidität unterschritten:</strong> Am{" "}
            {new Date(breach.date).toLocaleDateString("de-DE")} ({breach.daysAway} Tage) fällt die
            Prognose auf {formatCents(breach.balance)} — unter deine Schwelle von{" "}
            {formatCents(breach.threshold)}.{" "}
            <Link href="/forecast" className="underline">13-Wochen-Vorschau →</Link>
          </div>
        </div>
      )}

      <div className="card">
        <CashflowChart
          points={months.map((m) => ({
            label: m.label,
            inflow: m.inflow,
            outflow: m.outflow,
            inflowRealized: m.inflowRealized,
            inflowPlanned: m.inflowPlanned,
            outflowRealized: m.outflowRealized,
            outflowPlanned: m.outflowPlanned,
            endLiquidity: m.endLiquidity,
            isFuture: m.isFuture,
            isCurrent: m.isCurrent,
          }))}
          thresholdCents={planning.minLiquidityCents}
          scenarioLiquidity={scenarioMatrix ? scenarioMatrix.months.map((m) => m.endLiquidity) : undefined}
          scenarioName={activeScenario?.name}
        />
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Einzahlung realisiert</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-300" /> Einzahlung geplant</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" /> Auszahlung realisiert</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-300" /> Auszahlung geplant</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-[#007FFF]" /> Liquidität</span>
          {activeScenario && (
            <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-violet-500" /> Liquidität ({activeScenario.name})</span>
          )}
        </div>
      </div>

      <BudgetStatusCard
        status={budgetStatus}
        prevHref={bmQs(bm - 1)}
        nextHref={bmQs(Math.min(0, bm + 1))}
        canNext={bm < 0}
      />

      <div className="card overflow-x-auto p-0">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Kategorie
              </th>
              {months.map((m) => (
                <th
                  key={m.key}
                  className={`whitespace-nowrap px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide ${m.isCurrent ? "bg-brand/10 text-brand-fg" : "text-slate-500"}`}
                >
                  <Link href={`/drilldown?metric=range&from=${m.startISO}&to=${m.endISO}`} className="hover:text-brand hover:underline" title="Bewegungen anzeigen">
                    {m.label}
                  </Link>
                </th>
              ))}
              <th
                className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500"
                title="Anteil des Jahresbudgets, im laufenden Kalenderjahr erreicht/verbraucht"
              >
                % Jahr
              </th>
            </tr>
          </thead>
          <tbody>
            <SummaryRow label="Liquidität Start" values={months.map((m) => m.startLiquidity)} months={months} />
            <SummaryRow label="Einzahlungen" values={months.map((m) => m.inflow)} months={months} tone="in" />
            <SummaryRow label="· realisiert" values={months.map((m) => m.inflowRealized)} months={months} tone="in" muted />
            <SummaryRow label="· geplant" values={months.map((m) => m.inflowPlanned)} months={months} tone="in" muted />
            <SummaryRow label="Auszahlungen" values={months.map((m) => -m.outflow)} months={months} />
            <SummaryRow label="· realisiert" values={months.map((m) => -m.outflowRealized)} months={months} muted />
            <SummaryRow label="· geplant" values={months.map((m) => -m.outflowPlanned)} months={months} muted />
            <SummaryRow label="Nettoveränderung" values={months.map((m) => m.net)} months={months} />
            <SummaryRow label="Liquidität Ende" values={months.map((m) => m.endLiquidity)} months={months} strong />
          </tbody>
          <PivotSections months={months} incomeRows={matrix.incomeRows} expenseRows={matrix.expenseRows} />
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Vergangene Monate zeigen gebuchte Umsätze, künftige Monate die Planposten und offenen
        Posten. <strong>Tipp:</strong> Fahre mit der Maus über eine Zelle (oder tippe sie an), um die
        transaktionsgenauen Ist-Buchungen und das Soll (Budget / Planposten / offene Posten) zu sehen.
        Die Liquiditäts-Endwerte sind auf den aktuellen Kontostand verankert.
      </p>
    </div>
  );
}
