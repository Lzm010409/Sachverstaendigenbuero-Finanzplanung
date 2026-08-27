import Link from "next/link";
import { getPlanVsActual } from "@/lib/queries";
import { formatCents } from "@/lib/money";
import { CellHover } from "@/components/cell-hover";
import { GroupTableSection, Chevron } from "@/components/category-group";
import { budgetCellColor } from "@/lib/budget-color";
import { groupRowsByCategoryGroup, sumBy } from "@/lib/category-tree";
import type { PlanActualRow } from "@/lib/queries";

/** localStorage-Schlüssel für den Aufklapp-Zustand von Soll/Ist. */
const STORE_KEY = "cat:open:plan-actual";

/** Eine Kategoriezeile des Soll/Ist-Vergleichs. */
function PlanActualDataRow({
  r,
  fromISO,
  toISO,
  monthLabel,
  indent,
}: {
  r: PlanActualRow;
  fromISO: string;
  toISO: string;
  monthLabel: string;
  indent?: boolean;
}) {
  const diff = r.actual - r.planned;
  const q = { cat: r.categoryId ?? "none", from: fromISO, to: toISO };
  const title = `${r.categoryName} · ${monthLabel}`;
  // Farbskala: Ist gegen Plan – bei Ausgaben ist weniger besser, bei
  // Einnahmen mehr. Ohne Plan bleibt die Zelle neutral.
  const bg = budgetCellColor(Math.abs(r.actual), Math.abs(r.planned), r.kind === "INCOME");
  return (
    <tr className="border-b border-slate-50">
      <td className={`td font-medium ${indent ? "pl-6" : ""}`}>{r.categoryName}</td>
      <CellHover query={q} title={title} className="td text-right">{formatCents(r.planned)}</CellHover>
      <CellHover
        query={q}
        title={title}
        className="td text-right"
        style={bg ? { backgroundColor: bg } : undefined}
      >
        {formatCents(r.actual)}
      </CellHover>
      <td
        className={`td text-right font-semibold ${diff < 0 ? "text-red-600" : "text-emerald-600"}`}
        style={bg ? { backgroundColor: bg } : undefined}
      >
        {diff > 0 ? "+" : ""}
        {formatCents(diff)}
      </td>
    </tr>
  );
}
import { SortableTh } from "@/components/sortable-th";

export const dynamic = "force-dynamic";

export default async function PlanActualPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const monthOffset = Math.min(0, Math.max(-24, Number(sp.m) || 0));
  const { monthStart, rows: rawRows, categories } = await getPlanVsActual(monthOffset);

  // Sortierung (im Speicher, da die Zeilen aus einer Aggregation stammen).
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const mul = dir === "asc" ? 1 : -1;
  const sortVal: Record<string, (r: (typeof rawRows)[number]) => number | string> = {
    categoryName: (r) => r.categoryName.toLowerCase(),
    planned: (r) => r.planned,
    actual: (r) => r.actual,
    diff: (r) => r.actual - r.planned,
  };
  const rows = sp.sort && sortVal[sp.sort]
    ? [...rawRows].sort((a, b) => {
        const va = sortVal[sp.sort!](a);
        const vb = sortVal[sp.sort!](b);
        return va < vb ? -1 * mul : va > vb ? 1 * mul : 0;
      })
    : rawRows;

  // Zeilen nach Überkategorie bündeln (Summen stehen in der Kopfzeile).
  const grouped = groupRowsByCategoryGroup(rows, (r) => r.categoryId, categories);

  const monthLabel = monthStart.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const fromISO = monthStart.toISOString().slice(0, 10);
  const toISO = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const totalPlanned = rows.reduce((s, r) => s + r.planned, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const sortParams = { m: monthOffset !== 0 ? String(monthOffset) : undefined };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plan / Ist</h1>
          <p className="text-sm text-slate-500">Geplante gegen gebuchte Werte je Kategorie</p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="btn-secondary" href={`/plan-actual?m=${monthOffset - 1}`}>
            ← Vormonat
          </Link>
          <span className="min-w-[9rem] text-center text-sm font-medium">{monthLabel}</span>
          <Link
            className={`btn-secondary ${monthOffset >= 0 ? "pointer-events-none opacity-40" : ""}`}
            href={`/plan-actual?m=${Math.min(0, monthOffset + 1)}`}
          >
            Folgemonat →
          </Link>
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">
            Keine Daten für diesen Monat. Lege Planposten mit Kategorie an und importiere Umsätze.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <SortableTh col="categoryName" label="Kategorie" sort={sp.sort ?? ""} dir={dir} basePath="/plan-actual" params={sortParams} />
                  <SortableTh col="planned" label="Plan" sort={sp.sort ?? ""} dir={dir} basePath="/plan-actual" params={sortParams} align="right" />
                  <SortableTh col="actual" label="Ist" sort={sp.sort ?? ""} dir={dir} basePath="/plan-actual" params={sortParams} align="right" />
                  <SortableTh col="diff" label="Abweichung" sort={sp.sort ?? ""} dir={dir} basePath="/plan-actual" params={sortParams} align="right" />
                </tr>
              </thead>
              {grouped.map((g) => {
                const body = g.rows.map((r) => (
                  <PlanActualDataRow
                    key={r.categoryId ?? "none"}
                    r={r}
                    fromISO={fromISO}
                    toISO={toISO}
                    monthLabel={monthLabel}
                    indent={!!g.group}
                  />
                ));
                if (!g.group) return <tbody key="ohne">{body}</tbody>;
                const gPlanned = sumBy(g.rows, (r) => r.planned);
                const gActual = sumBy(g.rows, (r) => r.actual);
                const gDiff = gActual - gPlanned;
                const gBg = budgetCellColor(
                  Math.abs(gActual),
                  Math.abs(gPlanned),
                  g.group.kind === "INCOME",
                );
                return (
                  <GroupTableSection
                    key={g.group.id}
                    storeKey={STORE_KEY}
                    groupId={g.group.id}
                    header={
                      <tr className="border-b border-slate-100 bg-slate-50/80 font-semibold text-slate-800">
                        <td className="td">
                          <Chevron className="mr-2 align-middle" />
                          <span
                            className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                            style={{ backgroundColor: g.group.color }}
                          />
                          {g.group.name}
                          <span className="ml-2 text-xs font-normal text-slate-400">({g.rows.length})</span>
                        </td>
                        <td className="td text-right tabular-nums">{formatCents(gPlanned)}</td>
                        <td
                          className="td text-right tabular-nums"
                          style={gBg ? { backgroundColor: gBg } : undefined}
                        >
                          {formatCents(gActual)}
                        </td>
                        <td
                          className={`td text-right ${gDiff < 0 ? "text-red-600" : "text-emerald-600"}`}
                          style={gBg ? { backgroundColor: gBg } : undefined}
                        >
                          {gDiff > 0 ? "+" : ""}
                          {formatCents(gDiff)}
                        </td>
                      </tr>
                    }
                  >
                    {body}
                  </GroupTableSection>
                );
              })}
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold">
                  <td className="td">Summe</td>
                  <td className="td text-right">{formatCents(totalPlanned)}</td>
                  <td className="td text-right">{formatCents(totalActual)}</td>
                  <td
                    className={`td text-right ${totalActual - totalPlanned < 0 ? "text-red-600" : "text-emerald-600"}`}
                  >
                    {totalActual - totalPlanned > 0 ? "+" : ""}
                    {formatCents(totalActual - totalPlanned)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400">
        Hinweis: „Ist" basiert auf den gebuchten Umsätzen des Monats. „Plan" nimmt je Kategorie
        <strong> das Budget</strong> als Soll (Monatsbetrag = Jahreswert/12, sofern in diesem Monat
        gültig); nur wo <strong>kein Budget</strong> hinterlegt ist, greift der aktive
        <strong> Planposten</strong> der Kategorie. So zählt je Kategorie genau eine Plan-Quelle
        (keine Doppelung). Das Vorzeichen folgt dem Betrag (Ausgaben negativ).
      </p>
    </div>
  );
}
