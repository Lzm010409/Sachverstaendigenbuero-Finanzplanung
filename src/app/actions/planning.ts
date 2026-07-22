"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseAmountToCents } from "@/lib/money";
import { startOfDayUTC } from "@/lib/dates";
import type { FormState } from "./types";

const schema = z.object({
  name: z.string().min(1, "Name erforderlich"),
  amount: z.string().min(1, "Betrag erforderlich"),
  direction: z.enum(["in", "out"]),
  recurrence: z.enum(["ONCE", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
  interval: z.string().optional(),
  startDate: z.string().min(1, "Startdatum erforderlich"),
  endDate: z.string().optional(),
  categoryId: z.string().optional(),
  note: z.string().optional(),
});

export async function createPlannedItem(formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const d = parsed.data;
  const cents = parseAmountToCents(d.amount);
  if (cents == null) return { error: "Betrag unlesbar" };
  const signed = d.direction === "out" ? -Math.abs(cents) : Math.abs(cents);

  await prisma.plannedItem.create({
    data: {
      name: d.name,
      amount: signed,
      recurrence: d.recurrence,
      interval: Math.max(1, Number(d.interval) || 1),
      startDate: startOfDayUTC(new Date(d.startDate)),
      endDate: d.endDate ? startOfDayUTC(new Date(d.endDate)) : null,
      categoryId: d.categoryId || null,
      note: d.note || null,
    },
  });
  revalidatePath("/planning");
  revalidatePath("/");
  return { ok: true };
}

/** Übernimmt einen Wiederkehrer-Vorschlag als Planposten. */
export async function createPlannedFromSuggestion(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0); // Cent, vorzeichenbehaftet
  const recurrence = String(formData.get("recurrence") ?? "MONTHLY");
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const startISO = String(formData.get("startDate") ?? "");
  if (!name || !Number.isFinite(amount) || amount === 0) return;
  const rec = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"].includes(recurrence) ? recurrence : "MONTHLY";
  await prisma.plannedItem.create({
    data: {
      name,
      amount: Math.round(amount),
      recurrence: rec as "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY",
      interval: 1,
      startDate: startISO ? startOfDayUTC(new Date(startISO)) : startOfDayUTC(new Date()),
      categoryId,
      note: "aus Wiederkehrer-Erkennung",
    },
  });
  revalidatePath("/recurring");
  revalidatePath("/planning");
  revalidatePath("/");
}

export async function togglePlannedItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const item = await prisma.plannedItem.findUnique({ where: { id } });
  if (!item) return;
  await prisma.plannedItem.update({ where: { id }, data: { active: !item.active } });
  revalidatePath("/planning");
  revalidatePath("/");
}

export async function deletePlannedItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.plannedItem.delete({ where: { id } });
  revalidatePath("/planning");
  revalidatePath("/");
}
