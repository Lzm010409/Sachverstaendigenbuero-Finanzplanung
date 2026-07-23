"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { startOfDayUTC, todayUTC, addMonths } from "@/lib/dates";

// Aktionen der Seite „Plan-Check": legt aus einem Vorschlag ein Budget oder einen
// Planposten je Kategorie an. Idempotent: existiert bereits ein aktives Budget /
// ein aktiver Planposten für die Kategorie, wird dessen Betrag AKTUALISIERT
// (Monatsrhythmus) statt ein zweiter angelegt – so wird der Plan nie verdoppelt.

function revalidateAll() {
  revalidatePath("/plan-check");
  revalidatePath("/budgets");
  revalidatePath("/recurring");
  revalidatePath("/planning");
  revalidatePath("/breakdown");
  revalidatePath("/plan-actual");
  revalidatePath("/");
}

type Kind = "INCOME" | "EXPENSE";

function readCommon(formData: FormData) {
  const categoryId = String(formData.get("categoryId") ?? "");
  const kind = String(formData.get("kind") ?? "EXPENSE") === "INCOME" ? "INCOME" : "EXPENSE";
  const name = String(formData.get("name") ?? "").trim() || "Ohne Titel";
  const amount = Math.abs(Math.round(Number(formData.get("amount") ?? 0))); // Cent, Magnitude
  return { categoryId, kind: kind as Kind, name, amount };
}

/** Budget je Kategorie als Monats-Soll anlegen oder aktualisieren. */
export async function upsertBudgetFromReview(formData: FormData): Promise<void> {
  const { categoryId, kind, name, amount } = readCommon(formData);
  if (!categoryId || amount <= 0) return;

  const existing = await prisma.budget.findFirst({
    where: { categoryId, deletedAt: null, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) {
    await prisma.budget.update({
      where: { id: existing.id },
      data: { amount, period: "MONTHLY", kind },
    });
  } else {
    await prisma.budget.create({
      data: { title: name, kind, amount, period: "MONTHLY", categoryId, note: "aus Plan-Check" },
    });
  }
  revalidateAll();
}

/** Wiederkehrenden Planposten (monatlich) je Kategorie anlegen oder aktualisieren. */
export async function upsertPlannedFromReview(formData: FormData): Promise<void> {
  const { categoryId, kind, name, amount } = readCommon(formData);
  if (!categoryId || amount <= 0) return;
  const signed = kind === "EXPENSE" ? -amount : amount;

  const existing = await prisma.plannedItem.findFirst({
    where: { categoryId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) {
    await prisma.plannedItem.update({
      where: { id: existing.id },
      data: { amount: signed, recurrence: "MONTHLY", interval: 1 },
    });
  } else {
    // Start = erster Tag des nächsten Monats (sauberer Prognose-Start).
    const start = startOfDayUTC(addMonths(new Date(Date.UTC(todayUTC().getUTCFullYear(), todayUTC().getUTCMonth(), 1)), 1));
    await prisma.plannedItem.create({
      data: {
        name,
        amount: signed,
        recurrence: "MONTHLY",
        interval: 1,
        startDate: start,
        categoryId,
        note: "aus Plan-Check",
      },
    });
  }
  revalidateAll();
}
