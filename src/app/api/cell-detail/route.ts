import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { INCLUDED_ACCOUNT } from "@/lib/queries";
import { occurrencesBetween } from "@/lib/recurrence";
import { budgetAnnualCents, type BudgetPeriod } from "@/lib/budget";

export const dynamic = "force-dynamic";

// Liefert je Übersichts-Zelle (Kategorie × Monat) die transaktionsgenauen
// IST-Bewegungen und den SOLL-Zustand (Budget + Planposten + offene Posten).
// Wird beim Hover über eine Zelle abgerufen (fetch), damit die Übersicht nicht
// alle Transaktionen vorab laden muss.

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
  const catParam = q.get("cat") ?? "";
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? ""; // letzter Tag des Monats (inklusiv)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }
  const monthStart = new Date(from + "T00:00:00.000Z");
  const monthEndIncl = new Date(to + "T00:00:00.000Z");
  const nextDay = new Date(monthEndIncl.getTime() + 86_400_000);
  const catId = catParam === "none" || catParam === "" ? null : catParam;

  // IST: gebuchte Umsätze der Kategorie in diesem Monat.
  const txs = await prisma.transaction.findMany({
    where: {
      bookingDate: { gte: monthStart, lt: nextDay },
      account: INCLUDED_ACCOUNT,
      categoryId: catId,
    },
    select: { bookingDate: true, counterparty: true, purpose: true, amount: true },
    orderBy: { bookingDate: "asc" },
  });
  const istItems = txs.map((t) => ({
    date: iso(t.bookingDate),
    label: (t.counterparty || t.purpose || "—").slice(0, 60),
    amount: t.amount,
  }));
  const istTotal = istItems.reduce((s, i) => s + i.amount, 0);

  // SOLL: Budget (Monats-Soll) + Planposten + offene Posten (nur mit Kategorie).
  let budget: number | null = null;
  const planned: { date: string; name: string; amount: number }[] = [];
  const open: { date: string; label: string; amount: number }[] = [];

  if (catId) {
    const [cat, budgets, items, ois] = await Promise.all([
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
        where: { paid: false, categoryId: catId, dueDate: { gte: monthStart, lt: nextDay } },
        select: { kind: true, amount: true, paidAmount: true, dueDate: true, counterparty: true, reference: true },
      }),
    ]);

    let monthly = 0;
    let hasBudget = false;
    for (const b of budgets) {
      const overlaps =
        (!b.startDate || new Date(b.startDate).getTime() <= monthEndIncl.getTime()) &&
        (!b.endDate || new Date(b.endDate).getTime() >= monthStart.getTime());
      if (!overlaps) continue;
      monthly += Math.round(budgetAnnualCents(b.amount, b.period as BudgetPeriod) / 12);
      hasBudget = true;
    }
    if (hasBudget) budget = cat?.kind === "EXPENSE" ? -Math.abs(monthly) : Math.abs(monthly);

    for (const p of items) {
      for (const d of occurrencesBetween(p, monthStart, monthEndIncl)) {
        planned.push({ date: iso(d), name: p.name, amount: p.amount });
      }
    }
    planned.sort((a, b) => a.date.localeCompare(b.date));

    for (const o of ois) {
      const rem = o.amount - o.paidAmount;
      if (rem <= 0) continue;
      open.push({
        date: iso(o.dueDate),
        label: (o.counterparty || o.reference || "offener Posten").slice(0, 60),
        amount: o.kind === "RECEIVABLE" ? rem : -rem,
      });
    }
  }

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
