import { prisma } from "./db";
import type { CatNode } from "./category-tree";
import { budgetAnnualCents, type BudgetPeriod } from "./budget";
import { occurrencesBetween } from "./recurrence";

// Gleicht die Plandaten (Budgets + Planposten) mit den TATSÄCHLICHEN Umsätzen der
// letzten 3 vollen Monate ab (nur einbezogene Konten, ohne Geldtransfers) und
// liefert je Kategorie Ø-Ist/Monat, aktuellen Plan/Monat, Differenz und einen
// Status/Vorschlag. Rein lesend – Grundlage für die Seite „Plan-Check".

export type PlanReviewStatus = "ok" | "new" | "adjust" | "check-noist" | "check-irregular";

export interface PlanReviewRow {
  categoryId: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  months: number[]; // Magnitude je Monat (3 Werte)
  total: number;
  avg: number; // Ø/Monat (Magnitude, Cent)
  budgetMonthly: number; // aktuelles Budget/Monat (Cent)
  plannedMonthly: number; // aktueller Planposten/Monat (Cent)
  plan: number; // budgetMonthly + plannedMonthly
  diff: number; // avg - plan
  monthsWithActual: number; // in wie vielen der 3 Monate kam es vor
  status: PlanReviewStatus;
  suggestedAmount: number; // Vorschlag zum Vorbefüllen (Cent, Magnitude)
}

export interface PlanReview {
  months: { key: string; label: string; start: string; end: string }[];
  rows: PlanReviewRow[];
  hasData: boolean;
  /** Kategorien inkl. Überkategorie-Zuordnung – für die gruppierte Anzeige. */
  categories: CatNode[];
}

export async function getPlanReview(): Promise<PlanReview> {
  const latest = await prisma.transaction.findFirst({
    orderBy: { bookingDate: "desc" },
    select: { bookingDate: true },
  });
  const ref = latest?.bookingDate ?? new Date();
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();

  // 3 volle Monate VOR dem Monat der letzten Buchung (dieser gilt als evtl. unvollständig).
  const months = [] as { key: string; label: string; start: Date; end: Date }[];
  for (let i = 3; i >= 1; i--) {
    const start = new Date(Date.UTC(y, m - i, 1));
    const end = new Date(Date.UTC(y, m - i + 1, 1));
    months.push({
      key: start.toISOString().slice(0, 7),
      label: start.toLocaleDateString("de-DE", { month: "short", year: "2-digit" }),
      start,
      end,
    });
  }
  const windowStart = months[0].start;
  const windowEnd = months[months.length - 1].end;
  const lastOfWindow = new Date(windowEnd.getTime() - 86_400_000);

  const [cats, txs, budgets, planned] = await Promise.all([
    prisma.category.findMany({
      where: { deletedAt: null, isTransfer: false },
      select: { id: true, name: true, kind: true, color: true, parentId: true, isGroup: true },
    }),
    prisma.transaction.findMany({
      where: {
        bookingDate: { gte: windowStart, lt: windowEnd },
        account: { archived: false, excludedFromCalc: false },
        category: { isTransfer: false, deletedAt: null },
      },
      select: { amount: true, bookingDate: true, categoryId: true },
    }),
    prisma.budget.findMany({
      where: { deletedAt: null, active: true, categoryId: { not: null } },
      select: { categoryId: true, amount: true, period: true },
    }),
    prisma.plannedItem.findMany({
      where: { active: true, categoryId: { not: null } },
      select: { categoryId: true, amount: true, recurrence: true, interval: true, startDate: true, endDate: true },
    }),
  ]);

  const catById = new Map(cats.map((c) => [c.id, c]));

  const actual = new Map<string, number[]>();
  for (const t of txs) {
    if (!t.categoryId) continue;
    const idx = months.findIndex((mm) => t.bookingDate >= mm.start && t.bookingDate < mm.end);
    if (idx < 0) continue;
    const arr = actual.get(t.categoryId) ?? [0, 0, 0];
    arr[idx] += Math.abs(t.amount);
    actual.set(t.categoryId, arr);
  }

  const budgetMonthly = new Map<string, number>();
  for (const b of budgets) {
    const monthly = Math.round(budgetAnnualCents(b.amount, b.period as BudgetPeriod) / 12);
    budgetMonthly.set(b.categoryId!, (budgetMonthly.get(b.categoryId!) ?? 0) + monthly);
  }

  const plannedMonthly = new Map<string, number>();
  for (const p of planned) {
    const occ = occurrencesBetween(p, windowStart, lastOfWindow);
    if (occ.length === 0) continue;
    const perMonth = Math.round((Math.abs(p.amount) * occ.length) / 3);
    plannedMonthly.set(p.categoryId!, (plannedMonthly.get(p.categoryId!) ?? 0) + perMonth);
  }

  const keys = new Set<string>([...actual.keys(), ...budgetMonthly.keys(), ...plannedMonthly.keys()]);
  const rows: PlanReviewRow[] = [];
  for (const id of keys) {
    const c = catById.get(id);
    if (!c) continue;
    const mm = actual.get(id) ?? [0, 0, 0];
    const total = mm[0] + mm[1] + mm[2];
    const avg = Math.round(total / 3);
    const budget = budgetMonthly.get(id) ?? 0;
    const plannedM = plannedMonthly.get(id) ?? 0;
    const plan = budget + plannedM;
    const diff = avg - plan;
    const monthsWithActual = mm.filter((v) => v > 0).length;
    const regular = monthsWithActual >= 2;

    let status: PlanReviewStatus = "ok";
    if (plan === 0 && total > 0) {
      status = regular ? "new" : "check-irregular";
    } else if (plan > 0 && total === 0) {
      status = "check-noist";
    } else if (plan > 0) {
      const rel = Math.abs(diff) / plan;
      if (Math.abs(diff) >= 5000 && rel >= 0.25) status = "adjust";
    }

    rows.push({
      categoryId: id,
      name: c.name,
      kind: c.kind,
      months: mm,
      total,
      avg,
      budgetMonthly: budget,
      plannedMonthly: plannedM,
      plan,
      diff,
      monthsWithActual,
      status,
      suggestedAmount: avg,
    });
  }

  // Reihenfolge: zuerst Handlungsbedarf (neu/anpassen), dann nach Ø-Ist.
  const rank: Record<PlanReviewStatus, number> = { new: 0, adjust: 1, "check-irregular": 2, "check-noist": 3, ok: 4 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || b.avg - a.avg);

  return {
    months: months.map((mm) => ({ key: mm.key, label: mm.label, start: mm.start.toISOString(), end: mm.end.toISOString() })),
    rows,
    hasData: txs.length > 0,
    categories: cats.map((c) => ({
      id: c.id, name: c.name, kind: c.kind, color: c.color, parentId: c.parentId, isGroup: c.isGroup,
    })),
  };
}
