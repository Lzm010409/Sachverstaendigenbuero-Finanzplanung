"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseAmountToCents } from "@/lib/money";
import type { BudgetPeriod } from "@/lib/budget";
import type { FormState } from "./types";

const PERIODS = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
function parsePeriod(v: unknown): BudgetPeriod {
  const s = String(v ?? "");
  return (PERIODS as readonly string[]).includes(s) ? (s as BudgetPeriod) : "MONTHLY";
}
function parseDate(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? null : d;
}

function revalidateBudgetViews() {
  revalidatePath("/budgets");
  revalidatePath("/breakdown");
  revalidatePath("/");
}

const budgetSchema = z.object({
  title: z.string().min(1, "Titel erforderlich"),
  kind: z.enum(["INCOME", "EXPENSE"]),
  amount: z.string().optional(),
  period: z.string().optional(),
  categoryId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  note: z.string().optional(),
  includeInForecast: z.string().optional(),
});

function readForm(formData: FormData) {
  const parsed = budgetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message } as const;
  const d = parsed.data;
  const amount = Math.abs(parseAmountToCents(d.amount ?? "") ?? 0);
  if (amount <= 0) return { error: "Betrag angeben." } as const;
  return {
    data: {
      title: d.title.trim(),
      kind: d.kind,
      amount,
      period: parsePeriod(d.period),
      categoryId: d.categoryId && d.categoryId.length > 0 ? d.categoryId : null,
      startDate: parseDate(formData.get("startDate")),
      endDate: parseDate(formData.get("endDate")),
      note: d.note?.trim() || null,
      includeInForecast: d.includeInForecast === "on" || d.includeInForecast === "true",
    },
  } as const;
}

export async function createBudget(formData: FormData): Promise<FormState> {
  const r = readForm(formData);
  if ("error" in r) return { error: r.error };
  try {
    await prisma.budget.create({ data: r.data });
  } catch (e) {
    return { error: `Speichern fehlgeschlagen: ${(e as Error).message}` };
  }
  revalidateBudgetViews();
  return { ok: true };
}

export async function updateBudget(formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Budget nicht gefunden." };
  const r = readForm(formData);
  if ("error" in r) return { error: r.error };
  try {
    await prisma.budget.update({ where: { id }, data: r.data });
  } catch (e) {
    return { error: `Speichern fehlgeschlagen: ${(e as Error).message}` };
  }
  revalidateBudgetViews();
  return { ok: true };
}

/** Soft-Delete: 30 Tage wiederherstellbar in den Papierkorb legen. */
export async function deleteBudget(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.budget.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidateBudgetViews();
}

export async function restoreBudget(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.budget.update({ where: { id }, data: { deletedAt: null } });
  revalidateBudgetViews();
}

/** Endgültig löschen (aus dem Papierkorb). */
export async function purgeBudget(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.budget.delete({ where: { id } });
  revalidateBudgetViews();
}

/** Aktiv/inaktiv schalten (inaktive Budgets zählen nicht in Auswertungen). */
export async function toggleBudgetActive(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const b = await prisma.budget.findUnique({ where: { id }, select: { active: true } });
  if (!b) return;
  await prisma.budget.update({ where: { id }, data: { active: !b.active } });
  revalidateBudgetViews();
}
