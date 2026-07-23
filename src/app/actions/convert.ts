"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { startOfDayUTC, todayUTC } from "@/lib/dates";
import type { BudgetPeriod } from "@/lib/budget";

// Umwandeln zwischen Budget und Planposten – als „kopieren" (Quelle bleibt) oder
// „verschieben" (Quelle wird entfernt). Prognose-Flags werden so gesetzt, dass
// nichts doppelt in die Vorschau zählt und beim Verschieben der Prognosebeitrag
// erhalten bleibt.

type Recurrence = "ONCE" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

const PERIOD_TO_RECURRENCE: Record<BudgetPeriod, Recurrence> = {
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  YEARLY: "YEARLY",
};
const RECURRENCE_TO_PERIOD: Record<Recurrence, BudgetPeriod> = {
  ONCE: "MONTHLY", // einmalig lässt sich nicht als Budget-Rhythmus abbilden -> monatlich
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  YEARLY: "YEARLY",
};

function revalidateAll() {
  revalidatePath("/budgets");
  revalidatePath("/planning");
  revalidatePath("/plan-check");
  revalidatePath("/breakdown");
  revalidatePath("/plan-actual");
  revalidatePath("/");
}

/** Budget -> Planposten (kopieren/verschieben). */
export async function budgetToPlanned(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const mode = String(formData.get("mode") ?? "copy") === "move" ? "move" : "copy";
  if (!id) return;

  const b = await prisma.budget.findUnique({ where: { id } });
  if (!b || b.deletedAt) return;

  const signed = b.kind === "EXPENSE" ? -Math.abs(b.amount) : Math.abs(b.amount);
  await prisma.plannedItem.create({
    data: {
      name: b.title,
      amount: signed,
      recurrence: PERIOD_TO_RECURRENCE[b.period as BudgetPeriod],
      interval: 1,
      startDate: b.startDate ? startOfDayUTC(new Date(b.startDate)) : startOfDayUTC(todayUTC()),
      endDate: b.endDate ? startOfDayUTC(new Date(b.endDate)) : null,
      categoryId: b.categoryId,
      note: "aus Budget übernommen",
    },
  });

  if (mode === "move") {
    // Quelle in den Papierkorb (30 Tage wiederherstellbar).
    await prisma.budget.update({ where: { id }, data: { deletedAt: new Date() } });
  } else {
    // Kopie: Budget bleibt als Kontrollgröße, fließt aber nicht mehr zusätzlich
    // in die Prognose (Planposten übernimmt das) -> keine Doppelzählung.
    if (b.includeInForecast) {
      await prisma.budget.update({ where: { id }, data: { includeInForecast: false } });
    }
  }
  revalidateAll();
}

/** Planposten -> Budget (kopieren/verschieben). */
export async function plannedToBudget(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const mode = String(formData.get("mode") ?? "copy") === "move" ? "move" : "copy";
  if (!id) return;

  const p = await prisma.plannedItem.findUnique({ where: { id } });
  if (!p) return;

  const kind = p.amount < 0 ? "EXPENSE" : "INCOME";
  // Beim Verschieben den Prognosebeitrag erhalten (Planposten war in der Vorschau);
  // beim Kopieren bleibt der Planposten die Prognosequelle -> Budget nur Kontrolle.
  const includeInForecast = mode === "move";
  await prisma.budget.create({
    data: {
      title: p.name,
      kind,
      amount: Math.abs(p.amount),
      period: RECURRENCE_TO_PERIOD[p.recurrence as Recurrence],
      startDate: p.startDate ? startOfDayUTC(new Date(p.startDate)) : null,
      endDate: p.endDate ? startOfDayUTC(new Date(p.endDate)) : null,
      categoryId: p.categoryId,
      includeInForecast,
      note: "aus Planposten übernommen",
    },
  });

  if (mode === "move") {
    await prisma.plannedItem.delete({ where: { id } });
  }
  revalidateAll();
}
