"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatCents } from "@/lib/money";
import { budgetCellColor } from "@/lib/budget-color";
import { GroupTableSection, Chevron } from "@/components/category-group";
import { groupRowsByCategoryGroup, sumBy, type CatNode } from "@/lib/category-tree";

/** localStorage-Schlüssel für den Aufklapp-Zustand der Monatsmatrix. */
const STORE_KEY = "cat:open:pivot";

interface Month {
  key: string;
  label: string;
  startISO: string;
  endISO: string;
  isCurrent: boolean;
}
export interface PivotRow {
  categoryId: string | null;
  name: string;
  color: string;
  kind: "INCOME" | "EXPENSE" | "MIXED";
  values: number[];
  annualBudget: number;
  yearActual: number;
  budgetPct: number | null;
}

interface Detail {
  ist: { items: { date: string; label: string; amount: number }[]; total: number };
  soll: {
    budget: number | null;
    planned: { date: string; name: string; amount: number }[];
    open: { date: string; label: string; amount: number }[];
    total: number;
  };
}
type CacheVal = Detail | "loading" | "error";

const dm = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
};
const money = (c: number) => (
  <span className={c < 0 ? "text-red-600" : c > 0 ? "text-emerald-700" : "text-slate-400"}>{formatCents(c)}</span>
);

function eur(cents: number): string {
  if (cents === 0) return "–";
  return (cents / 100).toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €";
}

export function PivotSections({
  months,
  incomeRows,
  expenseRows,
  categories,
}: {
  months: Month[];
  incomeRows: PivotRow[];
  expenseRows: PivotRow[];
  categories: CatNode[];
}) {
  const cache = useRef<Map<string, CacheVal>>(new Map());
  const [, force] = useReducer((x) => x + 1, 0);
  const [pop, setPop] = useState<{ key: string; title: string; x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const closeT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  const load = (key: string, cat: string, from: string, to: string) => {
    if (cache.current.has(key)) return;
    cache.current.set(key, "loading");
    force();
    fetch(`/api/cell-detail?cat=${encodeURIComponent(cat)}&from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Detail) => cache.current.set(key, data))
      .catch(() => cache.current.set(key, "error"))
      .finally(force);
  };

  const openCell = (e: React.MouseEvent, row: PivotRow, mi: number) => {
    if (closeT.current) clearTimeout(closeT.current);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const key = `${row.categoryId ?? "none"}:${months[mi].key}`;
    const width = 340;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
    setPop({ key, title: `${row.name} · ${months[mi].label}`, x: Math.max(8, Math.min(r.left, vw - width - 8)), y: r.bottom + 4 });
    load(key, row.categoryId ?? "none", months[mi].startISO, months[mi].endISO);
  };
  const scheduleClose = () => {
    if (closeT.current) clearTimeout(closeT.current);
    closeT.current = setTimeout(() => setPop(null), 180);
  };
  const cancelClose = () => {
    if (closeT.current) clearTimeout(closeT.current);
  };

  const renderRow = (row: PivotRow) => {
    const isIncome = row.kind === "INCOME";
    const periodBudgetNA = row.budgetPct == null;
    const monthBudget = row.annualBudget > 0 ? row.annualBudget / 12 : 0;
    return (
      <tr key={row.categoryId ?? row.name} className="border-b border-slate-50">
        <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-sm text-slate-700">
          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: row.color }} />
          {row.name}
        </td>
        {row.values.map((v, i) => {
          // Farbskala je Monat gegen das anteilige Monatsbudget – dieselbe
          // Skala wie in der Auswertung, damit beide Ansichten gleich lesen.
          // Monat ohne Buchung bleibt neutral (siehe Auswertung).
          const bg = v === 0 ? undefined : budgetCellColor(Math.abs(v), monthBudget, isIncome);
          return (
            <td
              key={months[i].key}
              className={`cursor-help whitespace-nowrap px-3 py-1.5 text-right text-sm tabular-nums ${isIncome ? "text-emerald-700" : "text-red-600"} ${months[i].isCurrent ? "outline outline-1 -outline-offset-1 outline-brand/40" : ""} ${bg ? "hover:ring-2 hover:ring-inset hover:ring-brand/50" : "hover:bg-brand/10"}`}
              style={bg ? { backgroundColor: bg } : undefined}
              onMouseEnter={(e) => openCell(e, row, i)}
              onMouseLeave={scheduleClose}
              onClick={(e) => openCell(e, row, i)}
            >
              {v === 0 ? <span className="text-slate-300">–</span> : eur(v)}
            </td>
          );
        })}
        {/* % Jahr */}
        {periodBudgetNA ? (
          <td className="whitespace-nowrap px-3 py-1.5 text-right text-sm tabular-nums text-slate-300">–</td>
        ) : (
          <td
            className="whitespace-nowrap px-3 py-1.5 text-right text-sm font-semibold tabular-nums text-slate-800"
            style={budgetCellColor(row.yearActual, row.annualBudget, isIncome) ? { backgroundColor: budgetCellColor(row.yearActual, row.annualBudget, isIncome)! } : undefined}
            title={`${formatCents(row.yearActual)} von ${formatCents(row.annualBudget)} (Jahresbudget)`}
          >
            {Math.round((row.budgetPct ?? 0) * 100)} %
          </td>
        )}
      </tr>
    );
  };

  const detail = pop ? cache.current.get(pop.key) : undefined;

  // Zeilen nach Überkategorie bündeln; die Kopfzeile trägt die Monatssummen.
  const renderGrouped = (rows: PivotRow[]) =>
    groupRowsByCategoryGroup(rows, (r) => r.categoryId, categories).map((g) => {
      const body = g.rows.map(renderRow);
      if (!g.group) return <tbody key="ohne">{body}</tbody>;
      const isIncome = g.group.kind === "INCOME";
      const gBudget = sumBy(g.rows, (r) => r.annualBudget);
      const gActual = sumBy(g.rows, (r) => r.yearActual);
      const gMonthBudget = gBudget > 0 ? gBudget / 12 : 0;
      const gYearBg = budgetCellColor(gActual, gBudget, isIncome);
      return (
        <GroupTableSection
          key={g.group.id}
          storeKey={STORE_KEY}
          groupId={g.group.id}
          header={
            <tr className="border-b border-slate-100 bg-slate-50/80 font-semibold">
              <td className="sticky left-0 z-10 bg-slate-50 px-3 py-1.5 text-sm text-slate-800">
                <Chevron className="mr-2 align-middle" />
                <span
                  className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                  style={{ backgroundColor: g.group.color }}
                />
                {g.group.name}
                <span className="ml-2 text-xs font-normal text-slate-400">({g.rows.length})</span>
              </td>
              {months.map((m, i) => {
                const v = sumBy(g.rows, (r) => r.values[i] ?? 0);
                const bg = v === 0 ? undefined : budgetCellColor(Math.abs(v), gMonthBudget, isIncome);
                return (
                  <td
                    key={m.key}
                    className={`whitespace-nowrap px-3 py-1.5 text-right text-sm tabular-nums ${isIncome ? "text-emerald-700" : "text-red-600"} ${m.isCurrent && !bg ? "bg-brand/5" : ""} ${m.isCurrent ? "outline outline-1 -outline-offset-1 outline-brand/40" : ""}`}
                    style={bg ? { backgroundColor: bg } : undefined}
                  >
                    {v === 0 ? <span className="text-slate-300">–</span> : eur(v)}
                  </td>
                );
              })}
              <td
                className="whitespace-nowrap px-3 py-1.5 text-right text-sm font-semibold tabular-nums text-slate-800"
                style={gYearBg ? { backgroundColor: gYearBg } : undefined}
                title={gBudget > 0 ? `${formatCents(gActual)} von ${formatCents(gBudget)} (Jahresbudget)` : undefined}
              >
                {gBudget > 0 ? `${Math.round((gActual / gBudget) * 100)} %` : <span className="text-slate-300">–</span>}
              </td>
            </tr>
          }
        >
          {body}
        </GroupTableSection>
      );
    });

  return (
    <>
      <tbody>
        <tr className="bg-emerald-50/60">
          <td className="sticky left-0 z-10 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase text-emerald-700" colSpan={months.length + 2}>
            Einnahmen
          </td>
        </tr>
        {incomeRows.length === 0 && (
          <tr><td className="px-3 py-1.5 text-sm text-slate-400" colSpan={months.length + 2}>—</td></tr>
        )}
      </tbody>
      {renderGrouped(incomeRows)}
      <tbody>
        <tr className="bg-red-50/60">
          <td className="sticky left-0 z-10 bg-red-50 px-3 py-1.5 text-xs font-semibold uppercase text-red-700" colSpan={months.length + 2}>
            Ausgaben
          </td>
        </tr>
        {expenseRows.length === 0 && (
          <tr><td className="px-3 py-1.5 text-sm text-slate-400" colSpan={months.length + 2}>—</td></tr>
        )}
      </tbody>
      {renderGrouped(expenseRows)}

      {pop && mounted &&
        createPortal(
          <div
            className="fixed z-[200] w-[340px] rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xl"
            style={{ left: pop.x, top: pop.y }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <div className="mb-2 font-semibold text-slate-700">{pop.title}</div>
            {detail === "loading" || detail === undefined ? (
              <div className="flex items-center gap-2 py-2 text-slate-400"><span className="jd-spinner h-3.5 w-3.5" /> lädt…</div>
            ) : detail === "error" ? (
              <div className="py-2 text-red-500">Konnte Details nicht laden.</div>
            ) : (
              <DetailView detail={detail} />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function DetailView({ detail }: { detail: Detail }) {
  const { ist, soll } = detail;
  const hasSoll = soll.budget != null || soll.planned.length > 0 || soll.open.length > 0;
  const abw = ist.total - (soll.budget ?? 0);
  return (
    <div className="space-y-2">
      {/* IST */}
      <div>
        <div className="mb-1 flex items-center justify-between text-slate-500">
          <span className="font-medium uppercase tracking-wide">Ist (gebucht)</span>
          <span className="tabular-nums">{money(ist.total)}</span>
        </div>
        {ist.items.length === 0 ? (
          <p className="text-slate-400">keine Buchungen</p>
        ) : (
          <div className="max-h-40 space-y-0.5 overflow-y-auto">
            {ist.items.map((it, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-slate-400">{dm(it.date)}</span>
                <span className="truncate text-slate-600">{it.label}</span>
                <span className="shrink-0 tabular-nums">{money(it.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SOLL */}
      <div className="border-t border-slate-100 pt-2">
        <div className="mb-1 font-medium uppercase tracking-wide text-slate-500">Soll / geplant</div>
        {!hasSoll ? (
          <p className="text-slate-400">kein Soll hinterlegt</p>
        ) : (
          <div className="space-y-0.5">
            {soll.budget != null && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-600">Budget (Monats-Soll)</span>
                <span className="tabular-nums">{money(soll.budget)}</span>
              </div>
            )}
            {soll.planned.map((p, i) => (
              <div key={`p${i}`} className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-slate-400">{dm(p.date)}</span>
                <span className="truncate text-slate-600">{p.name} <span className="text-slate-300">· Planposten</span></span>
                <span className="shrink-0 tabular-nums">{money(p.amount)}</span>
              </div>
            ))}
            {soll.open.map((o, i) => (
              <div key={`o${i}`} className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-slate-400">{dm(o.date)}</span>
                <span className="truncate text-slate-600">{o.label} <span className="text-slate-300">· offener Posten</span></span>
                <span className="shrink-0 tabular-nums">{money(o.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Abweichung ggü. Budget */}
      {soll.budget != null && (
        <div className="flex items-center justify-between border-t border-slate-100 pt-2 font-medium text-slate-700">
          <span>Abweichung Ist − Budget</span>
          <span className="tabular-nums">{money(abw)}</span>
        </div>
      )}
      <p className="text-[10px] text-slate-400">
        <Link href="/breakdown" className="text-brand hover:underline">Auswertung →</Link>
      </p>
    </div>
  );
}
