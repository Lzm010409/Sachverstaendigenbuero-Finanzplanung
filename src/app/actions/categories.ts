"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseAmountToCents } from "@/lib/money";
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

export async function setCategoryBudget(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const cents = parseAmountToCents(String(formData.get("annualBudget") ?? "")) ?? 0;
  await prisma.category.update({ where: { id }, data: { annualBudget: Math.abs(cents) } });
  revalidatePath("/categories");
  revalidatePath("/breakdown");
}

const ruleSchema = z.object({
  categoryId: z.string().min(1, "Kategorie erforderlich"),
  field: z.enum(["COUNTERPARTY", "PURPOSE"]),
  pattern: z.string().optional(),
  amountOp: z.enum(["", "GT", "LT", "GTE", "LTE", "EQ"]).optional(),
  amountValue: z.string().optional(),
  priority: z.string().optional(),
});

export async function createRule(formData: FormData): Promise<FormState> {
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const d = parsed.data;
  const pattern = (d.pattern ?? "").trim();
  const amountOp = d.amountOp || null;
  const amountValue = amountOp ? parseAmountToCents(d.amountValue ?? "") : null;

  if (!pattern && amountOp == null) {
    return { error: "Mindestens ein Muster oder eine Betrags-Bedingung angeben." };
  }
  if (amountOp && amountValue == null) {
    return { error: "Betrag für die Bedingung angeben." };
  }

  await prisma.rule.create({
    data: {
      categoryId: d.categoryId,
      field: d.field,
      pattern: pattern || null,
      amountOp,
      amountValue,
      priority: Number(d.priority) || 100,
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

// Aktualisiert die Kategorie vieler Umsätze effizient (gruppiert nach Kategorie).
async function bulkAssign(byCat: Map<string, string[]>): Promise<number> {
  let updated = 0;
  for (const [categoryId, ids] of byCat) {
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      await prisma.transaction.updateMany({ where: { id: { in: chunk } }, data: { categoryId } });
      updated += chunk.length;
    }
  }
  return updated;
}

/** Wendet alle aktiven Regeln auf noch nicht kategorisierte Umsätze an (Batch). */
export async function applyRulesToUncategorized() {
  const { categorize } = await import("@/lib/categorize");
  const [rules, txs] = await Promise.all([
    prisma.rule.findMany({ where: { active: true } }),
    prisma.transaction.findMany({
      where: { categoryId: null },
      select: { id: true, counterparty: true, purpose: true, amount: true },
    }),
  ]);
  const byCat = new Map<string, string[]>();
  for (const tx of txs) {
    const categoryId = categorize(tx, rules);
    if (categoryId) (byCat.get(categoryId) ?? byCat.set(categoryId, []).get(categoryId)!).push(tx.id);
  }
  const updated = await bulkAssign(byCat);
  revalidatePath("/transactions");
  revalidatePath("/categories");
  return { updated };
}

/** Entfernt die Kategorie-Zuordnung von ALLEN Umsätzen (Umsätze bleiben erhalten). */
export async function resetAllTransactionCategories() {
  const r = await prisma.transaction.updateMany({ data: { categoryId: null } });
  revalidatePath("/transactions");
  revalidatePath("/categories");
  revalidatePath("/breakdown");
  revalidatePath("/");
  return { updated: r.count };
}

/** Entfernt die Kategorie-Zuordnung der Umsätze eines Kontos. */
export async function resetAccountCategories(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) return { updated: 0 };
  const r = await prisma.transaction.updateMany({
    where: { accountId },
    data: { categoryId: null },
  });
  revalidatePath("/transactions");
  revalidatePath("/breakdown");
  revalidatePath("/");
  return { updated: r.count };
}

/**
 * Kategorisiert offene Umsätze anhand bereits kategorisierter Umsätze mit
 * gleicher Gegenpartei (häufigste Kategorie gewinnt). Ideal, um z.B. aus dem
 * finban-Import gelernte Kategorien auf neue (sevDesk-)Umsätze zu übertragen.
 */
export async function applyHistoryCategorization() {
  const categorized = await prisma.transaction.findMany({
    where: { categoryId: { not: null } },
    select: { counterparty: true, purpose: true, categoryId: true },
  });

  // Häufigste Kategorie je Gegenpartei (Fallback: je Verwendungszweck-Anfang).
  const freq = new Map<string, Map<string, number>>();
  const bump = (key: string, cat: string) => {
    const k = key.trim().toLowerCase();
    if (!k) return;
    if (!freq.has(k)) freq.set(k, new Map());
    const m = freq.get(k)!;
    m.set(cat, (m.get(cat) ?? 0) + 1);
  };
  for (const t of categorized) {
    if (!t.categoryId) continue;
    bump(t.counterparty, t.categoryId);
  }
  const best = new Map<string, string>();
  for (const [key, m] of freq) {
    let top: string | null = null;
    let max = 0;
    for (const [cat, n] of m) if (n > max) ((max = n), (top = cat));
    if (top) best.set(key, top);
  }

  const uncategorized = await prisma.transaction.findMany({
    where: { categoryId: null },
    select: { id: true, counterparty: true },
  });
  const byCat = new Map<string, string[]>();
  for (const t of uncategorized) {
    const cat = best.get(t.counterparty.trim().toLowerCase());
    if (cat) (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(t.id);
  }
  const updated = await bulkAssign(byCat);
  revalidatePath("/transactions");
  revalidatePath("/categories");
  return { updated };
}
