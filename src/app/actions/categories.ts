"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { FormState } from "./types";

const catSchema = z.object({
  name: z.string().min(1, "Name erforderlich"),
  kind: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().optional(),
});

export async function createCategory(formData: FormData): Promise<FormState> {
  const parsed = catSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  await prisma.category.create({
    data: {
      name: parsed.data.name,
      kind: parsed.data.kind,
      color: parsed.data.color || "#64748b",
    },
  });
  revalidatePath("/categories");
  return { ok: true };
}

export async function deleteCategory(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.category.delete({ where: { id } });
  revalidatePath("/categories");
}

const ruleSchema = z.object({
  categoryId: z.string().min(1, "Kategorie erforderlich"),
  field: z.enum(["COUNTERPARTY", "PURPOSE"]),
  pattern: z.string().min(1, "Muster erforderlich"),
  priority: z.string().optional(),
});

export async function createRule(formData: FormData): Promise<FormState> {
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  await prisma.rule.create({
    data: {
      categoryId: parsed.data.categoryId,
      field: parsed.data.field,
      pattern: parsed.data.pattern,
      priority: Number(parsed.data.priority) || 100,
    },
  });
  revalidatePath("/categories");
  return { ok: true };
}

export async function deleteRule(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.rule.delete({ where: { id } });
  revalidatePath("/categories");
}

/** Wendet alle aktiven Regeln erneut auf noch nicht kategorisierte Umsätze an. */
export async function applyRulesToUncategorized() {
  const { categorize } = await import("@/lib/categorize");
  const [rules, txs] = await Promise.all([
    prisma.rule.findMany({ where: { active: true } }),
    prisma.transaction.findMany({ where: { categoryId: null } }),
  ]);
  let updated = 0;
  for (const tx of txs) {
    const categoryId = categorize(tx, rules);
    if (categoryId) {
      await prisma.transaction.update({ where: { id: tx.id }, data: { categoryId } });
      updated++;
    }
  }
  revalidatePath("/transactions");
  revalidatePath("/categories");
  return { updated };
}
