"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseAmountToCents } from "@/lib/money";
import { startOfDayUTC } from "@/lib/dates";
import type { FormState } from "./types";

const schema = z.object({
  kind: z.enum(["RECEIVABLE", "PAYABLE"]),
  counterparty: z.string().optional(),
  reference: z.string().optional(),
  amount: z.string().min(1, "Betrag erforderlich"),
  issueDate: z.string().optional(),
  dueDate: z.string().min(1, "Fälligkeit erforderlich"),
  categoryId: z.string().optional(),
  note: z.string().optional(),
});

export async function createOpenItem(formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const d = parsed.data;
  const cents = parseAmountToCents(d.amount);
  if (cents == null || cents <= 0) return { error: "Betrag muss positiv sein." };

  await prisma.openItem.create({
    data: {
      kind: d.kind,
      counterparty: d.counterparty ?? "",
      reference: d.reference || null,
      amount: Math.abs(cents),
      issueDate: d.issueDate ? startOfDayUTC(new Date(d.issueDate)) : null,
      dueDate: startOfDayUTC(new Date(d.dueDate)),
      categoryId: d.categoryId || null,
      note: d.note || null,
    },
  });
  revalidatePath("/open-items");
  revalidatePath("/");
  return { ok: true };
}

export async function toggleOpenItemPaid(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const item = await prisma.openItem.findUnique({ where: { id } });
  if (!item) return;
  const nowPaid = !item.paid;
  await prisma.openItem.update({
    where: { id },
    data: {
      paid: nowPaid,
      paidAmount: nowPaid ? item.amount : 0,
      paidDate: nowPaid ? new Date() : null,
    },
  });
  revalidatePath("/open-items");
  revalidatePath("/");
}

/** Erfasst eine Teilzahlung (bereits bezahlter Betrag). */
export async function setOpenItemPayment(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const item = await prisma.openItem.findUnique({ where: { id } });
  if (!item) return;
  const entered = parseAmountToCents(String(formData.get("paidAmount") ?? "")) ?? 0;
  const paidAmount = Math.max(0, Math.min(item.amount, entered));
  const paid = paidAmount >= item.amount;
  await prisma.openItem.update({
    where: { id },
    data: { paidAmount, paid, paidDate: paid ? new Date() : null },
  });
  revalidatePath("/open-items");
  revalidatePath("/");
}

export async function deleteOpenItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.openItem.delete({ where: { id } });
  revalidatePath("/open-items");
  revalidatePath("/");
}

/** Setzt die Mahnstufe (0–3) einer Forderung. */
export async function setReminderLevel(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const level = Math.max(0, Math.min(3, Number(formData.get("level") ?? 0)));
  await prisma.openItem.update({ where: { id }, data: { reminderLevel: level } });
  revalidatePath("/receivables");
  revalidatePath("/open-items");
}
