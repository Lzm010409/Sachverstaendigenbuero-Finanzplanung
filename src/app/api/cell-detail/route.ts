import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { INCLUDED_ACCOUNT, getTransferCategoryIds } from "@/lib/queries";
import { getForecastBudgetItems } from "@/lib/budgets";
import { occurrencesBetween } from "@/lib/recurrence";
import { budgetAnnualCents, type BudgetPeriod } from "@/lib/budget";

export const dynamic = "force-dynamic";

// Liefert für eine Tabellen-Zelle (Kategorie × Zeitraum) die transaktionsgenauen
// IST-Bewegungen und den SOLL-/Geplant-Zustand (Budget + Planposten + offene
// Posten). Parameter:
//   cat  = Kategorie-ID | "none" (ohne Kategorie) | "all" (alle, für die Wochenvorschau)
//   from = Bereichsstart (yyyy-mm-dd), to = Bereichsende inklusiv (yyyy-mm-dd)
//   dir  = optional "in" | "out" (nur Zu- bzw. Abflüsse)
// Wird beim Hover geladen (fetch) und clientseitig gecacht.

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const cat = q.get("cat") ?? "";
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  const dir = q.get("dir"); // "in" | "out" | null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }
  const start = new Date(from + "T00:00:00.000Z");
  const endIncl = new Date(to + "T00:00:00.000Z");
  const nextDay = new Date(endIncl.getTime() + 86_400_000);
  const periodDays = Math.max(1, Math.round((nextDay.getTime() - start.getTime()) / 86_400_000));

  const all = cat === "all";
  const catId = all ? undefined : cat === "none" || cat === "" ? null : cat;
  const transferIds = await getTransferCategoryIds();
  const sign = (amt: number) => (dir === "in" ? amt > 0 : dir === "out" ? amt < 0 : true);
  const notTransfer = (id: string | null) => !(id && transferIds.has(id));

  // IST: gebuchte Umsätze im Zeitraum.
  const txs = await prisma.transaction.findMany({
    where: {
      bookingDate: { gte: start, lt: nextDay },
      account: INCLUDED_ACCOUNT,
      ...(all ? {} : { categoryId: catId }),
    },
    select: { bookingDate: true, counterparty: true, purpose: true, amount: true, categoryId: true },
    orderBy: { bookingDate: "asc" },
  });
  const istItems = txs
    .filter((t) => sign(t.amount) && (all ? notTransfer(t.categoryId) : true))
    .map((t) => ({ date: iso(t.bookingDate), label: (t.counterparty || t.purpose || "—").slice(0, 60), amount: t.amount }));
  const istTotal = istItems.reduce((s, i) => s + i.amount, 0);

  // SOLL / geplant.
  let budget: number | null = null;
  const planned: { date: string; name: string; amount: number }[] = [];
  const open: { date: string; label: string; amount: number }[] = [];

  if (all) {
    // Wochenvorschau: alle geplanten Bewegungen (Planposten + Budget-Prognose + offene Posten).
    const [items, budgetItems, ois] = await Promise.all([
      prisma.plannedItem.findMany({
        where: { active: true },
        select: { name: true, amount: true, recurrence: true, interval: true, startDate: true, endDate: true, categoryId: true },
      }),
      getForecastBudgetItems(),
      prisma.openItem.findMany({
        where: { paid: false, dueDate: { gte: start, lt: nextDay } },
        select: { kind: true, amount: true, paidAmount: true, dueDate: true, counterparty: true, reference: true, categoryId: true },
      }),
    ]);
    for (const p of items) {
      if (!notTransfer(p.categoryId)) continue;
      if (!sign(p.amount)) continue;
      for (const d of occurrencesBetween(p, start, endIncl)) planned.push({ date: iso(d), name: p.name, amount: p.amount });
    }
    for (const b of budgetItems) {
      if (!notTransfer(b.categoryId) || !sign(b.amount)) continue;
      for (const d of occurrencesBetween(b, start, endIncl)) planned.push({ date: iso(d), name: `${b.name} · Budget-Prognose`, amount: b.amount });
    }
    for (const o of ois) {
      if (!notTransfer(o.categoryId)) continue;
      const rem = o.amount - o.paidAmount;
      if (rem <= 0) continue;
      const amt = o.kind === "RECEIVABLE" ? rem : -rem;
      if (!sign(amt)) continue;
      open.push({ date: iso(o.dueDate), label: (o.counterparty || o.reference || "offener Posten").slice(0, 60), amount: amt });
    }
  } else if (catId) {
    const [c, budgets, items, ois] = await Promise.all([
      prisma.category.findUnique({ where: { id: catId }, select: { kind: true } }),
      prisma.budget.findMany({
        where: { deletedAt: null, active: true, categoryId: catId },
        select: { amount: true, period: true, startDate: true, endDate: true },
      }),
      prisma.plannedItem.findMany({
        where: { active: true, categoryId: catId },
        select: { name: true, amount: true, recurrence: true, interval: true, startDate: true, endDate: true },
      }),
      prisma.openItem.findMany({
        where: { paid: false, categoryId: catId, dueDate: { gte: start, lt: nextDay } },
        select: { kind: true, amount: true, paidAmount: true, dueDate: true, counterparty: true, reference: true },
      }),
    ]);
    // Budget anteilig auf die Periodenlänge (Woche/Monat/Jahr) umgerechnet.
    let periodBudget = 0;
    let hasBudget = false;
    for (const b of budgets) {
      const overlaps =
        (!b.startDate || new Date(b.startDate).getTime() <= endIncl.getTime()) &&
        (!b.endDate || new Date(b.endDate).getTime() >= start.getTime());
      if (!overlaps) continue;
      periodBudget += Math.round((budgetAnnualCents(b.amount, b.period as BudgetPeriod) / 365) * periodDays);
      hasBudget = true;
    }
    if (hasBudget) budget = c?.kind === "EXPENSE" ? -Math.abs(periodBudget) : Math.abs(periodBudget);

    for (const p of items) for (const d of occurrencesBetween(p, start, endIncl)) planned.push({ date: iso(d), name: p.name, amount: p.amount });
    planned.sort((a, b) => a.date.localeCompare(b.date));
    for (const o of ois) {
      const rem = o.amount - o.paidAmount;
      if (rem <= 0) continue;
      open.push({ date: iso(o.dueDate), label: (o.counterparty || o.reference || "offener Posten").slice(0, 60), amount: o.kind === "RECEIVABLE" ? rem : -rem });
    }
  }

  planned.sort((a, b) => a.date.localeCompare(b.date));
  open.sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    ist: { items: istItems, total: istTotal },
    soll: {
      budget,
      planned,
      open,
      total: (budget ?? 0) + planned.reduce((s, p) => s + p.amount, 0) + open.reduce((s, o) => s + o.amount, 0),
    },
  });
}
