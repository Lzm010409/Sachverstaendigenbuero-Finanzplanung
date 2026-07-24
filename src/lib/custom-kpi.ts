import { prisma } from "./db";
import { INCLUDED_ACCOUNT, getTransferCategoryIds } from "./queries";
import { todayUTC, addDays, addMonths, startOfDayUTC } from "./dates";

export type Metric = "net" | "income" | "expense" | "volume" | "count" | "avg";
export type RangeKind = "mtd" | "last_month" | "ytd" | "last_year" | "last_30d" | "last_90d" | "rolling_12m" | "custom";
export type Display = "number" | "bar" | "line" | "pie";
export type GroupBy = "none" | "month" | "week" | "category";
export type TileSize = "sm" | "md" | "lg" | "xl";

export interface CustomKpiDef {
  id: string;
  name: string;
  metric: Metric;
  categoryIds: string[];
  rangeKind: RangeKind;
  customFrom: Date | null;
  customTo: Date | null;
  display: Display;
  groupBy: GroupBy;
  size: TileSize;
  compare: boolean;
  showOnDashboard: boolean;
  showOnReport: boolean;
  sortOrder: number;
}

export interface KpiPoint {
  label: string;
  value: number;
  color?: string;
}

export type CustomKpiResult = {
  id: string;
  name: string;
  display: Display;
  size: TileSize;
  unit: "cents" | "count";
  rangeLabel: string;
  metricLabel: string;
} & (
  | { kind: "number"; value: number; delta: number | null; deltaPct: number | null }
  | { kind: "series"; points: KpiPoint[]; total: number }
);

export const METRIC_LABEL: Record<Metric, string> = {
  net: "Netto (Ein − Aus)",
  income: "Einnahmen",
  expense: "Ausgaben",
  volume: "Umsatzvolumen",
  count: "Anzahl Buchungen",
  avg: "Ø Betrag / Buchung",
};

export const RANGE_LABEL: Record<RangeKind, string> = {
  mtd: "laufender Monat",
  last_month: "Vormonat",
  ytd: "laufendes Jahr",
  last_year: "Vorjahr",
  last_30d: "letzte 30 Tage",
  last_90d: "letzte 90 Tage",
  rolling_12m: "letzte 12 Monate",
  custom: "eigener Zeitraum",
};

const MON = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// [from, to) für den gewählten Zeitraum (to exklusiv). „bis" ist inklusive
// heute (bzw. Monats-/Jahresende bei abgeschlossenen Perioden).
function resolveRange(def: CustomKpiDef, now: Date): { from: Date; to: Date; prevFrom: Date; prevTo: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const tomorrow = addDays(startOfDayUTC(now), 1);
  let from: Date, to: Date;
  switch (def.rangeKind) {
    case "mtd":
      from = new Date(Date.UTC(y, m, 1)); to = tomorrow; break;
    case "last_month":
      from = new Date(Date.UTC(y, m - 1, 1)); to = new Date(Date.UTC(y, m, 1)); break;
    case "ytd":
      from = new Date(Date.UTC(y, 0, 1)); to = tomorrow; break;
    case "last_year":
      from = new Date(Date.UTC(y - 1, 0, 1)); to = new Date(Date.UTC(y, 0, 1)); break;
    case "last_30d":
      from = addDays(tomorrow, -30); to = tomorrow; break;
    case "last_90d":
      from = addDays(tomorrow, -90); to = tomorrow; break;
    case "rolling_12m":
      from = addMonths(tomorrow, -12); to = tomorrow; break;
    case "custom":
      from = def.customFrom ? startOfDayUTC(def.customFrom) : new Date(Date.UTC(y, 0, 1));
      to = def.customTo ? addDays(startOfDayUTC(def.customTo), 1) : tomorrow;
      break;
    default:
      from = new Date(Date.UTC(y, 0, 1)); to = tomorrow;
  }
  // Vorperiode gleicher Länge unmittelbar davor (für den Vergleich).
  const spanMs = to.getTime() - from.getTime();
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - spanMs);
  return { from, to, prevFrom, prevTo };
}

interface Tx { amount: number; categoryId: string | null; bookingDate: Date }

function aggregate(txs: Tx[], metric: Metric): number {
  if (metric === "count") return txs.length;
  let sum = 0, count = 0;
  for (const t of txs) {
    count++;
    switch (metric) {
      case "net": sum += t.amount; break;
      case "income": if (t.amount > 0) sum += t.amount; break;
      case "expense": if (t.amount < 0) sum += -t.amount; break;
      case "volume": sum += Math.abs(t.amount); break;
      case "avg": sum += t.amount; break;
    }
  }
  if (metric === "avg") return count > 0 ? Math.round(sum / count) : 0;
  return sum;
}

function isoWeek(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { year: date.getUTCFullYear(), week };
}

/** Berechnet eine benutzerdefinierte Kennzahl (Zahl oder Datenreihe). */
export async function computeCustomKpi(def: CustomKpiDef, now = todayUTC()): Promise<CustomKpiResult> {
  const { from, to, prevFrom, prevTo } = resolveRange(def, now);
  const transferIds = await getTransferCategoryIds();
  const catFilter = def.categoryIds.length ? new Set(def.categoryIds) : null;

  const rows = await prisma.transaction.findMany({
    where: { bookingDate: { gte: def.compare ? prevFrom : from, lt: to }, account: INCLUDED_ACCOUNT },
    select: { amount: true, categoryId: true, bookingDate: true },
  });
  const keep = (t: Tx) =>
    !(t.categoryId && transferIds.has(t.categoryId)) && (!catFilter || (t.categoryId != null && catFilter.has(t.categoryId)));
  const inMain = rows.filter((t) => keep(t) && t.bookingDate >= from && t.bookingDate < to);

  const unit: "cents" | "count" = def.metric === "count" ? "count" : "cents";
  const rangeLabel = RANGE_LABEL[def.rangeKind];
  const metricLabel = METRIC_LABEL[def.metric];
  const common = { id: def.id, name: def.name, display: def.display, size: def.size, unit, rangeLabel, metricLabel };

  if (def.display === "number") {
    const value = aggregate(inMain, def.metric);
    let delta: number | null = null, deltaPct: number | null = null;
    if (def.compare) {
      const inPrev = rows.filter((t) => keep(t) && t.bookingDate >= prevFrom && t.bookingDate < prevTo);
      const prev = aggregate(inPrev, def.metric);
      delta = value - prev;
      deltaPct = prev !== 0 ? Math.round((delta / Math.abs(prev)) * 100) : null;
    }
    return { ...common, kind: "number", value, delta, deltaPct };
  }

  // Datenreihe (Balken/Linie/Kreis)
  let points: KpiPoint[] = [];
  if (def.groupBy === "category") {
    const cats = await prisma.category.findMany({ where: { deletedAt: null }, select: { id: true, name: true, color: true } });
    const info = new Map(cats.map((c) => [c.id, c]));
    const byCat = new Map<string, Tx[]>();
    for (const t of inMain) {
      const k = t.categoryId ?? "__none__";
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k)!.push(t);
    }
    points = [...byCat.entries()].map(([k, list]) => ({
      label: k === "__none__" ? "ohne Kategorie" : info.get(k)?.name ?? "—",
      value: aggregate(list, def.metric),
      color: k === "__none__" ? "#94a3b8" : info.get(k)?.color,
    }));
    // Für Kreis/Balken nach Betrag sortiert (Magnitude).
    points.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  } else {
    // Zeitliche Gruppierung (Monat/Woche): leere Perioden mit 0 auffüllen.
    const buckets = new Map<string, { label: string; order: number; list: Tx[] }>();
    const ensure = (keyStr: string, label: string, order: number) => {
      if (!buckets.has(keyStr)) buckets.set(keyStr, { label, order, list: [] });
      return buckets.get(keyStr)!;
    };
    if (def.groupBy === "week") {
      // Alle Wochen im Zeitraum vorbelegen.
      let cur = startOfDayUTC(from);
      const day = (cur.getUTCDay() + 6) % 7;
      cur = addDays(cur, -day); // Wochenstart (Montag)
      while (cur < to) {
        const w = isoWeek(cur);
        ensure(`${w.year}-${String(w.week).padStart(2, "0")}`, `KW ${w.week}`, w.year * 100 + w.week);
        cur = addDays(cur, 7);
      }
      for (const t of inMain) {
        const w = isoWeek(t.bookingDate);
        ensure(`${w.year}-${String(w.week).padStart(2, "0")}`, `KW ${w.week}`, w.year * 100 + w.week).list.push(t);
      }
    } else {
      // Monatlich
      let cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
      while (cur < to) {
        ensure(`${cur.getUTCFullYear()}-${cur.getUTCMonth()}`, `${MON[cur.getUTCMonth()]} ${String(cur.getUTCFullYear()).slice(2)}`, cur.getUTCFullYear() * 100 + cur.getUTCMonth(), );
        cur = addMonths(cur, 1);
      }
      for (const t of inMain) {
        const d = t.bookingDate;
        ensure(`${d.getUTCFullYear()}-${d.getUTCMonth()}`, `${MON[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`, d.getUTCFullYear() * 100 + d.getUTCMonth()).list.push(t);
      }
    }
    points = [...buckets.values()]
      .sort((a, b) => a.order - b.order)
      .map((b) => ({ label: b.label, value: aggregate(b.list, def.metric) }));
  }

  const total = aggregate(inMain, def.metric);
  return { ...common, kind: "series", points, total };
}

export async function computeCustomKpis(defs: CustomKpiDef[], now = todayUTC()): Promise<CustomKpiResult[]> {
  return Promise.all(defs.map((d) => computeCustomKpi(d, now)));
}

/** Lädt alle Definitionen (Prisma-Row -> Def). */
export async function getCustomKpiDefs(where?: { showOnDashboard?: boolean; showOnReport?: boolean }): Promise<CustomKpiDef[]> {
  const rows = await prisma.customKpi.findMany({ where, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map((r) => ({
    id: r.id, name: r.name, metric: r.metric as Metric, categoryIds: r.categoryIds,
    rangeKind: r.rangeKind as RangeKind, customFrom: r.customFrom, customTo: r.customTo,
    display: r.display as Display, groupBy: r.groupBy as GroupBy, size: r.size as TileSize,
    compare: r.compare, showOnDashboard: r.showOnDashboard, showOnReport: r.showOnReport, sortOrder: r.sortOrder,
  }));
}
