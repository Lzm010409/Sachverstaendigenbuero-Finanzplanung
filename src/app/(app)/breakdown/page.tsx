import Link from "next/link";
import { getCategoryBreakdown, type BreakdownRow, type Granularity } from "@/lib/analytics";
import { formatCents } from "@/lib/money";
import { budgetCellColor } from "@/lib/budget-color";
import { GranularityToggle } from "@/components/granularity-toggle";
import { PageAlerts } from "@/components/page-alerts";
import { BreakdownRowInfo } from "./row-info";
import { CellHover } from "@/components/cell-hover";
import { Fragment } from "react";
import { GroupTableSection, Chevron } from "@/components/category-group";
import { groupRowsByCategoryGroup, sumBy, type CatNode } from "@/lib/category-tree";

/** localStorage-Schlüssel für den Aufklapp-Zustand der Auswertung. */
const STORE_KEY = "cat:open:breakdown";

export const dynamic = "force-dynamic";

function pctLabel(pct: number | null): string {
  if (pct == null) return "–";
  return `${Math.round(pct * 100)} %`;
}

/** Eine Kategoriezeile der Auswertung. */
function BreakdownDataRow({
  r,
  periods,
  divisor,
  showProjection,
  projPctOf,
  indent,
}: {
  r: BreakdownRow;
  periods: { key: string; label: string; start: Date; end: Date }[];
  divisor: number;
  showProjection: boolean;
  projPctOf: (yearActual: number, annualBudget: number) => number | null;
  indent?: boolean;
}) {
  const isIncome = r.kind === "INCOME";
  const periodBudget = r.annualBudget > 0 ? r.annualBudget / divisor : 0;
  return (
    <tr className="border-b border-slate-50">
            <td className={`td sticky left-0 z-10 bg-white font-medium ${indent ? "pl-6" : ""}`}>
              <BreakdownRowInfo
                name={r.name}
                color={r.color}
                isIncome={isIncome}
                periods={periods}
                values={r.values}
                periodBudget={Math.round(periodBudget)}
                annualBudget={r.annualBudget}
                yearActual={r.yearActual}
                budgetPct={r.budgetPct}
              />
            </td>
            {r.values.map((v, i) => {
              // Ohne Buchung im Zeitraum keine Bewertung – eine leere Periode ist
              // weder gut noch schlecht (künftige Monate wären sonst pauschal grün/rot).
              const bg = v === 0 ? undefined : budgetCellColor(Math.abs(v), periodBudget, isIncome);
              const from = periods[i].start.toISOString().slice(0, 10);
              const to = new Date(periods[i].end.getTime() - 86_400_000).toISOString().slice(0, 10);
              return (
                <CellHover
                  key={periods[i].key}
                  query={{ cat: r.categoryId ?? "none", from, to }}
                  title={`${r.name} · ${periods[i].label}`}
                  className="td whitespace-nowrap text-right tabular-nums"
                  style={bg ? { backgroundColor: bg } : undefined}
                >
                  {v === 0 ? <span className="text-slate-300">–</span> : formatCents(v)}
                </CellHover>
              );
            })}
            <td className="td whitespace-nowrap text-right text-slate-500">
              {r.annualBudget > 0 ? formatCents(isIncome ? r.annualBudget : -r.annualBudget) : "–"}
            </td>
            <td
              className="td whitespace-nowrap text-right font-semibold"
              style={
                budgetCellColor(r.yearActual, r.annualBudget, isIncome)
                  ? { backgroundColor: budgetCellColor(r.yearActual, r.annualBudget, isIncome) }
                  : undefined
              }
            >
              {pctLabel(r.budgetPct)}
              {showProjection && r.annualBudget > 0 && (() => {
                const pp = projPctOf(r.yearActual, r.annualBudget)!;
                const breach = !isIncome && pp > 100;
                return (
                  <div
                    className={`text-[10px] font-normal ${breach ? "text-red-600" : "text-slate-400"}`}
                    title={`Hochrechnung Jahresende (linear): ${pp} % des Jahresbudgets`}
                  >
                    {breach ? "⚠ " : "→ "}{pp} % Prog.
                  </div>
                );
              })()}
            </td>
          </tr>
  );
}

function Section({
  title,
  rows,
  categories,
  periods,
  divisor,
  elapsed,
}: {
  title: string;
  rows: BreakdownRow[];
  categories: CatNode[];
  periods: { key: string; label: string; start: Date; end: Date }[];
  divisor: number;
  elapsed: number; // verstrichener Jahresanteil (0..1) für die Hochrechnung
}) {
  if (rows.length === 0) return null;
  const isIncomeSection = rows[0].kind === "INCOME";
  // Hochrechnung nur sinnvoll im laufenden (noch nicht abgeschlossenen) Jahr.
  const showProjection = elapsed > 0.02 && elapsed < 0.995;
  const projPctOf = (yearActual: number, annualBudget: number) =>
    annualBudget > 0 ? Math.round((yearActual / elapsed / annualBudget) * 100) : null;
  // Kumulierte Werte der Sektion: Spaltensummen (Ist je Zeitraum) sowie
  // Jahres-Ist/-Budget (nur Kategorien mit Budget) für den Ist/Soll-Vergleich.
  const periodSums = periods.map((_, i) => rows.reduce((s, r) => s + (r.values[i] ?? 0), 0));
  const budgeted = rows.filter((r) => r.annualBudget > 0);
  const sumBudget = budgeted.reduce((s, r) => s + r.annualBudget, 0);
  const sumActual = budgeted.reduce((s, r) => s + r.yearActual, 0);
  const sumPct = sumBudget > 0 ? Math.round((sumActual / sumBudget) * 100) : null;
  const sumBg = budgetCellColor(sumActual, sumBudget, isIncomeSection);
  // Budget-Auslastung je Zeitraum: Ist der budgetierten Kategorien gegen das
  // anteilige Perioden-Budget (Jahresbudget / Divisor: 12 Monat, 52 Woche, 1 Jahr).
  const periodBudgetTotal = sumBudget / divisor;
  const periodBudgetedSums = periods.map((_, i) => budgeted.reduce((s, r) => s + (r.values[i] ?? 0), 0));
  const periodPct = periodBudgetedSums.map((v) =>
    periodBudgetTotal > 0 ? Math.round((Math.abs(v) / periodBudgetTotal) * 100) : null,
  );
  // Zeilen nach Überkategorie bündeln. Die Kopfzeile einer Überkategorie trägt
  // die aufsummierten Perioden- und Jahreswerte, damit eingeklappt nichts fehlt.
  const grouped = groupRowsByCategoryGroup(rows, (r) => r.categoryId, categories);
  const rowProps = { periods, divisor, showProjection, projPctOf };

  const renderGroups = () =>
    grouped.map((g) => {
      if (!g.group) {
        return (
          <Fragment key="ohne">
            {g.rows.map((r) => (
              <BreakdownDataRow key={r.categoryId ?? r.name} r={r} {...rowProps} />
            ))}
          </Fragment>
        );
      }
      const gVals = periods.map((_, i) => sumBy(g.rows, (r) => r.values[i] ?? 0));
      const gBudget = sumBy(g.rows, (r) => r.annualBudget);
      const gActual = sumBy(g.rows, (r) => r.yearActual);
      const gPct = gBudget > 0 ? Math.round((gActual / gBudget) * 100) : null;
      const gBg = budgetCellColor(gActual, gBudget, isIncomeSection);
      const gPeriodBudget = gBudget > 0 ? gBudget / divisor : 0;
      return (
        <GroupTableSection
          key={g.group.id}
          storeKey={STORE_KEY}
          groupId={g.group.id}
          header={
            <tr className="border-b border-slate-100 bg-slate-50/80 font-semibold text-slate-800">
              <td className="td sticky left-0 z-10 bg-slate-50">
                <Chevron className="mr-2 align-middle" />
                <span
                  className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                  style={{ backgroundColor: g.group.color }}
                />
                {g.group.name}
                <span className="ml-2 text-xs font-normal text-slate-400">({g.rows.length})</span>
              </td>
              {gVals.map((v, i) => {
                // Gleiche Farbskala wie bei den Einzelkategorien: das
                // aufsummierte Jahresbudget der Gruppe anteilig je Periode.
                const bg = v === 0 ? undefined : budgetCellColor(Math.abs(v), gPeriodBudget, isIncomeSection);
                return (
                  <td
                    key={periods[i].key}
                    className="td whitespace-nowrap text-right tabular-nums"
                    style={bg ? { backgroundColor: bg } : undefined}
                  >
                    {v === 0 ? <span className="text-slate-300">–</span> : formatCents(v)}
                  </td>
                );
              })}
              <td className="td whitespace-nowrap text-right tabular-nums">
                {gBudget > 0 ? formatCents(isIncomeSection ? gBudget : -gBudget) : "–"}
              </td>
              <td
                className="td whitespace-nowrap text-right"
                style={gBg ? { backgroundColor: gBg } : undefined}
              >
                {gPct != null ? `${gPct} %` : "–"}
              </td>
            </tr>
          }
        >
          {g.rows.map((r) => (
            <BreakdownDataRow key={r.categoryId ?? r.name} r={r} {...rowProps} indent />
          ))}
        </GroupTableSection>
      );
    });

  return (
    <>
      <tbody>
        <tr className="bg-slate-50">
          <td className="td font-semibold text-slate-700" colSpan={periods.length + 3}>
            {title}
          </td>
        </tr>
      </tbody>
      {renderGroups()}
      {/* Kumulierte Summenzeile der Sektion (Ist je Zeitraum + Ist/Soll Jahr). */}
      <tbody>
      <tr className="border-y-2 border-slate-200 bg-slate-100 font-semibold text-slate-800">
        <td className="td sticky left-0 z-10 bg-slate-100">Summe {title}</td>
        {periodSums.map((v, i) => {
          // Farbskala auch auf der Summenzeile: Ist der budgetierten
          // Kategorien gegen das anteilige Perioden-Budget der Sektion.
          const bg = periodBudgetedSums[i] === 0
            ? undefined
            : budgetCellColor(Math.abs(periodBudgetedSums[i]), periodBudgetTotal, isIncomeSection);
          return (
          <td
            key={periods[i].key}
            className="td whitespace-nowrap text-right tabular-nums"
            style={bg ? { backgroundColor: bg } : undefined}
          >
            {v === 0 ? <span className="text-slate-300">–</span> : formatCents(v)}
            {periodPct[i] != null && (
              <div
                className={`text-[10px] font-normal ${!isIncomeSection && periodPct[i]! > 100 ? "text-red-600" : "text-slate-400"}`}
                title={`Budget-Auslastung ${periods[i].label}: ${periodPct[i]} % des anteiligen Budgets`}
              >
                {periodPct[i]} % Budget
              </div>
            )}
          </td>
          );
        })}
        <td className="td whitespace-nowrap text-right tabular-nums">
          {sumBudget > 0 ? formatCents(isIncomeSection ? sumBudget : -sumBudget) : "–"}
        </td>
        <td
          className="td whitespace-nowrap text-right"
          style={sumBg ? { backgroundColor: sumBg } : undefined}
          title={sumBudget > 0 ? `Ist ${formatCents(isIncomeSection ? sumActual : -sumActual)} / Soll ${formatCents(isIncomeSection ? sumBudget : -sumBudget)}` : undefined}
        >
          {sumPct != null ? `${sumPct} %` : "–"}
          {showProjection && sumBudget > 0 && (() => {
            const pp = projPctOf(sumActual, sumBudget)!;
            const breach = !isIncomeSection && pp > 100;
            return (
              <div
                className={`text-[10px] font-normal ${breach ? "text-red-600" : "text-slate-400"}`}
                title={`Hochrechnung Jahresende (linear): ${pp} % des Gesamtbudgets`}
              >
                {breach ? "⚠ " : "→ "}{pp} % Prog.
              </div>
            );
          })()}
        </td>
      </tr>
      </tbody>
    </>
  );
}

export default async function BreakdownPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; offset?: string }>;
}) {
  const sp = await searchParams;
  const granularity: Granularity =
    sp.g === "week" || sp.g === "year" ? (sp.g as Granularity) : "month";
  const offset = Math.max(0, Number(sp.offset) || 0);
  const data = await getCategoryBreakdown(granularity, offset);
  const hasRows = data.incomeRows.length > 0 || data.expenseRows.length > 0;
  const rangeLabel = `${data.periods[0]?.label} – ${data.periods[data.periods.length - 1]?.label}`;
  const qs = (o: number) => `/breakdown?g=${granularity}${o > 0 ? `&offset=${o}` : ""}`;

  // Gesamt-Budgetauslastung des laufenden Jahres (nur Kategorien mit Budget):
  // Summe Ist / Summe Jahresbudget – getrennt für Einnahmen und Ausgaben.
  const sumOver = (rows: BreakdownRow[], sel: (r: BreakdownRow) => number) =>
    rows.filter((r) => r.annualBudget > 0).reduce((s, r) => s + sel(r), 0);
  const incActual = sumOver(data.incomeRows, (r) => r.yearActual);
  const incBudget = sumOver(data.incomeRows, (r) => r.annualBudget);
  const expActual = sumOver(data.expenseRows, (r) => r.yearActual);
  const expBudget = sumOver(data.expenseRows, (r) => r.annualBudget);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
  const incPct = pct(incActual, incBudget);
  const expPct = pct(expActual, expBudget);
  // Lineare Hochrechnung aufs Jahresende (nur im laufenden Jahr sinnvoll).
  const elapsed = data.yearElapsedFraction;
  const showProj = elapsed > 0.02 && elapsed < 0.995;
  const projIncPct = showProj ? pct(incActual / elapsed, incBudget) : null;
  const projExpPct = showProj ? pct(expActual / elapsed, expBudget) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auswertung</h1>
          <p className="text-sm text-slate-500">
            Transaktionen je Kategorie und Zeitraum, inkl. Jahresbudget-Verbrauch
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Link href={qs(offset + 1)} className="btn-secondary px-2 py-1 text-sm" title="früher">←</Link>
            <span className="min-w-[130px] text-center text-sm text-slate-600">{rangeLabel}</span>
            {offset > 0 ? (
              <Link href={qs(offset - 1)} className="btn-secondary px-2 py-1 text-sm" title="später">→</Link>
            ) : (
              <span className="btn-secondary cursor-not-allowed px-2 py-1 text-sm opacity-40">→</span>
            )}
          </div>
          <GranularityToggle current={granularity} />
        </div>
      </div>

      <PageAlerts page="/breakdown" />

      <div className="card overflow-x-auto p-0">
        {!hasRows ? (
          <p className="p-5 text-sm text-slate-400">Keine Daten im gewählten Zeitraum.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="th sticky left-0 z-10 bg-white">Kategorie</th>
                {data.periods.map((p) => {
                  const from = p.start.toISOString().slice(0, 10);
                  const to = new Date(p.end.getTime() - 86_400_000).toISOString().slice(0, 10);
                  return (
                    <th key={p.key} className="th text-right">
                      <Link href={`/drilldown?metric=range&from=${from}&to=${to}`} className="hover:text-brand hover:underline">
                        {p.label}
                      </Link>
                    </th>
                  );
                })}
                <th className="th text-right">Jahresbudget</th>
                <th className="th text-right">% Jahr</th>
              </tr>
            </thead>
            <Section title="Einnahmen" rows={data.incomeRows} categories={data.categories} periods={data.periods} divisor={data.periodBudgetDivisor} elapsed={data.yearElapsedFraction} />
            <Section title="Ausgaben" rows={data.expenseRows} categories={data.categories} periods={data.periods} divisor={data.periodBudgetDivisor} elapsed={data.yearElapsedFraction} />
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Die Zellfarbe zeigt den Budgetverbrauch je Zeitraum (grün = im Rahmen, rot = überzogen; bei
        Einnahmen umgekehrt). Budgets pflegst du unter <strong>Kategorien</strong>. Die Spalte „% Jahr"
        zeigt den Verbrauch des laufenden Kalenderjahres am Jahresbudget. Die Zeile
        <strong> „Summe Einnahmen/Ausgaben"</strong> kumuliert je Zeitraum (Ist) sowie das gesamte
        Jahresbudget (Soll) und dessen Auslastung. Der Wert <strong>„… % Budget"</strong> je Monat zeigt,
        wie viel des <em>anteiligen</em> Gesamtbudgets (Jahresbudget ÷ 12 bzw. ÷ 52 je Woche) in diesem
        Zeitraum verbraucht wurde. Das Feld unten rechts zeigt den Jahres-Ist/Soll-Vergleich. Die Angabe
        <strong> „→ … % Prog."</strong> ist die lineare <strong>Hochrechnung aufs Jahresende</strong>
        (Ist ÷ bereits verstrichener Jahresanteil); <strong>⚠</strong> markiert ein voraussichtlich
        gerissenes Ausgabenbudget (&gt; 100 %).
      </p>

      {hasRows && (incPct != null || expPct != null) && (
        <div className="fixed bottom-4 right-4 z-40 rounded-lg border border-slate-200 bg-white/95 px-4 py-2.5 text-sm shadow-lg backdrop-blur">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Budget Ist / Soll{showProj ? " · → Prognose" : ""} (Jahr)
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Einnahmen
              </span>
              <span className="tabular-nums text-slate-600">
                {formatCents(incActual)} / {formatCents(incBudget)}
                <strong className="ml-2 text-emerald-700">{incPct != null ? `${incPct} %` : "–"}</strong>
                {projIncPct != null && <span className="ml-1 text-slate-400" title="Hochrechnung Jahresende">→ {projIncPct} %</span>}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                Ausgaben
              </span>
              <span className="tabular-nums text-slate-600">
                {formatCents(-expActual)} / {formatCents(-expBudget)}
                <strong className={`ml-2 ${expPct != null && expPct > 100 ? "text-red-600" : "text-slate-800"}`}>
                  {expPct != null ? `${expPct} %` : "–"}
                </strong>
                {projExpPct != null && (
                  <span className={`ml-1 ${projExpPct > 100 ? "font-semibold text-red-600" : "text-slate-400"}`} title="Hochrechnung Jahresende">
                    {projExpPct > 100 ? "⚠ " : "→ "}{projExpPct} %
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
