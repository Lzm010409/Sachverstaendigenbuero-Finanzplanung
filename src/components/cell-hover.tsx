"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatCents } from "@/lib/money";

export interface CellDetail {
  ist: { items: { date: string; label: string; amount: number }[]; total: number };
  soll: {
    budget: number | null;
    planned: { date: string; name: string; amount: number }[];
    open: { date: string; label: string; amount: number }[];
    total: number;
  };
}
type CacheVal = CellDetail | "loading" | "error";

// Modul-weiter Cache (über alle Zellen/Seiten hinweg), Schlüssel = Abfrage-URL.
const cache = new Map<string, CacheVal>();

const dm = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
};
const money = (c: number) => (
  <span className={c < 0 ? "text-red-600" : c > 0 ? "text-emerald-700" : "text-slate-400"}>{formatCents(c)}</span>
);

function buildUrl(query: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v != null && v !== "") p.set(k, v);
  return `/api/cell-detail?${p.toString()}`;
}

/**
 * Tabellenzelle (<td>) mit Ist/Soll-Hover-Popover. Lädt die Details beim ersten
 * Hover über /api/cell-detail und cacht sie modulweit. Per Portal gerendert,
 * damit kein Scroll-Container das Popover abschneidet.
 */
export function CellHover({
  query,
  title,
  className,
  style,
  children,
}: {
  query: Record<string, string | undefined>;
  title: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const url = buildUrl(query);
  const [, force] = useReducer((x) => x + 1, 0);
  const [pop, setPop] = useState<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const closeT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => () => {
    if (closeT.current) clearTimeout(closeT.current);
  }, []);

  const loadAndOpen = (el: HTMLElement) => {
    if (closeT.current) clearTimeout(closeT.current);
    const r = el.getBoundingClientRect();
    const width = 340;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
    setPop({ x: Math.max(8, Math.min(r.left, vw - width - 8)), y: r.bottom + 4 });
    if (!cache.has(url)) {
      cache.set(url, "loading");
      force();
      fetch(url)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data: CellDetail) => cache.set(url, data))
        .catch(() => cache.set(url, "error"))
        .finally(force);
    }
  };
  const scheduleClose = () => {
    if (closeT.current) clearTimeout(closeT.current);
    closeT.current = setTimeout(() => setPop(null), 180);
  };

  const detail = cache.get(url);

  return (
    <td
      className={`${className ?? ""} cursor-help hover:bg-brand/10`}
      style={style}
      onMouseEnter={(e) => loadAndOpen(e.currentTarget)}
      onMouseLeave={scheduleClose}
      onClick={(e) => loadAndOpen(e.currentTarget)}
    >
      {children}
      {pop && mounted &&
        createPortal(
          <div
            className="fixed z-[200] w-[340px] rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xl"
            style={{ left: pop.x, top: pop.y }}
            onMouseEnter={() => closeT.current && clearTimeout(closeT.current)}
            onMouseLeave={scheduleClose}
          >
            <div className="mb-2 font-semibold text-slate-700">{title}</div>
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
    </td>
  );
}

function DetailView({ detail }: { detail: CellDetail }) {
  const { ist, soll } = detail;
  const hasSoll = soll.budget != null || soll.planned.length > 0 || soll.open.length > 0;
  const abw = ist.total - (soll.budget ?? 0);
  return (
    <div className="space-y-2">
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

      <div className="border-t border-slate-100 pt-2">
        <div className="mb-1 font-medium uppercase tracking-wide text-slate-500">Soll / geplant</div>
        {!hasSoll ? (
          <p className="text-slate-400">kein Soll hinterlegt</p>
        ) : (
          <div className="max-h-40 space-y-0.5 overflow-y-auto">
            {soll.budget != null && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-600">Budget (Soll)</span>
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
