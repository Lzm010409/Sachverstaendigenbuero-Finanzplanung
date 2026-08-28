"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toMatchableRule } from "@/lib/categorize";
import { type Node, parseTree } from "@/lib/rule-expr";
import type { FormState } from "./types";

// Kategorien sind reine Klassifizierungs-Labels (Name, Art, Farbe). Das
// Finanzielle (Budget / geplante Ausgabe) ist bewusst entkoppelt und lebt im
// eigenen Budget-Objekt – siehe actions/budgets.ts.
const catSchema = z.object({
  name: z.string().min(1, "Name erforderlich"),
  kind: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().optional(),
  isTransfer: z.string().optional(),
  // Optionale Zuordnung zu einer Überkategorie.
  parentId: z.string().optional(),
});

export async function createCategory(formData: FormData): Promise<FormState> {
  const parsed = catSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const parentId = parsed.data.parentId || null;
  if (parentId) {
    const problem = await pruefeUeberkategorie(parentId, parsed.data.kind);
    if (problem) return { error: problem };
  }
  await prisma.category.create({
    data: {
      name: parsed.data.name,
      kind: parsed.data.kind,
      color: parsed.data.color || "#64748b",
      isTransfer: parsed.data.isTransfer === "on",
      parentId,
    },
  });
  revalidatePath("/categories");
  return { ok: true };
}

/**
 * Prüft, ob `parentId` eine gültige Überkategorie für eine Kategorie der Art
 * `kind` ist. Gibt eine Fehlermeldung zurück oder null, wenn alles passt.
 * Einnahme/Ausgabe muss übereinstimmen, sonst brechen die Ein-/Ausgaben-
 * Trennungen in Auswertung, Budgets und Steuer-Vorschau.
 */
async function pruefeUeberkategorie(parentId: string, kind: "INCOME" | "EXPENSE"): Promise<string | null> {
  const parent = await prisma.category.findUnique({
    where: { id: parentId },
    select: { isGroup: true, kind: true, deletedAt: true },
  });
  if (!parent) return "Überkategorie nicht gefunden.";
  if (parent.deletedAt) return "Überkategorie liegt im Papierkorb.";
  if (!parent.isGroup) return "Zielobjekt ist keine Überkategorie.";
  if (parent.kind !== kind) {
    return "Überkategorie und Kategorie müssen beide Einnahme oder beide Ausgabe sein.";
  }
  return null;
}

const groupSchema = z.object({
  name: z.string().min(1, "Name erforderlich"),
  kind: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().optional(),
});

/** Legt eine Überkategorie an – reine Gliederung, nicht bebuchbar. */
export async function createCategoryGroup(formData: FormData): Promise<FormState> {
  const parsed = groupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  await prisma.category.create({
    data: {
      name: parsed.data.name,
      kind: parsed.data.kind,
      color: parsed.data.color || "#64748b",
      isGroup: true,
    },
  });
  revalidatePath("/categories");
  return { ok: true };
}

/**
 * Ordnet eine Kategorie einer Überkategorie zu (leerer Wert = herauslösen).
 * Überkategorien selbst können nicht zugeordnet werden – die Hierarchie bleibt
 * bewusst genau eine Ebene tief.
 */
export async function setCategoryParent(formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const parentIdRaw = String(formData.get("parentId") ?? "");
  if (!id) return { error: "Kategorie fehlt." };

  const cat = await prisma.category.findUnique({
    where: { id },
    select: { kind: true, isGroup: true },
  });
  if (!cat) return { error: "Kategorie nicht gefunden." };
  if (cat.isGroup) return { error: "Eine Überkategorie kann keiner weiteren Überkategorie zugeordnet werden." };

  const parentId = parentIdRaw || null;
  if (parentId) {
    if (parentId === id) return { error: "Eine Kategorie kann sich nicht selbst enthalten." };
    const problem = await pruefeUeberkategorie(parentId, cat.kind);
    if (problem) return { error: problem };
  }

  await prisma.category.update({ where: { id }, data: { parentId } });
  revalidatePathsForCategories();
  return { ok: true };
}

/** Benennt eine Kategorie oder Überkategorie um bzw. ändert ihre Farbe. */
export async function updateCategory(formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  if (!id) return { error: "Kategorie fehlt." };
  if (!name) return { error: "Name erforderlich" };
  await prisma.category.update({
    where: { id },
    data: { name, ...(color ? { color } : {}) },
  });
  revalidatePathsForCategories();
  return { ok: true };
}

/**
 * Wendet einen Überkategorie-Vorschlag an: legt fehlende Überkategorien an und
 * ordnet die genannten Kategorien zu. Bestehende Zuordnungen bleiben
 * unangetastet, ein zweiter Lauf ändert nichts mehr (idempotent).
 */
export async function applyCategoryGroupSuggestion(formData: FormData): Promise<FormState> {
  const roh = String(formData.get("vorschlag") ?? "");
  if (!roh) return { error: "Kein Vorschlag übergeben." };

  let vorschlaege: { gruppe: string; farbe: string; kind: "INCOME" | "EXPENSE"; categoryIds: string[] }[];
  try {
    vorschlaege = JSON.parse(roh);
  } catch {
    return { error: "Vorschlag konnte nicht gelesen werden." };
  }
  if (!Array.isArray(vorschlaege) || vorschlaege.length === 0) {
    return { error: "Vorschlag ist leer." };
  }

  let angelegt = 0;
  let zugeordnet = 0;

  for (const v of vorschlaege) {
    if (!v?.gruppe || !Array.isArray(v.categoryIds) || v.categoryIds.length === 0) continue;
    // Gleichnamige Überkategorie derselben Art wiederverwenden statt doppeln.
    let gruppe = await prisma.category.findFirst({
      where: { name: v.gruppe, kind: v.kind, isGroup: true, deletedAt: null },
      select: { id: true },
    });
    if (!gruppe) {
      gruppe = await prisma.category.create({
        data: { name: v.gruppe, kind: v.kind, color: v.farbe || "#64748b", isGroup: true },
        select: { id: true },
      });
      angelegt++;
    }
    // Nur noch nicht zugeordnete, gleichartige Kategorien einhängen.
    const res = await prisma.category.updateMany({
      where: { id: { in: v.categoryIds }, parentId: null, isGroup: false, kind: v.kind, deletedAt: null },
      data: { parentId: gruppe.id },
    });
    zugeordnet += res.count;
  }

  revalidatePathsForCategories();
  return { ok: true, message: `${angelegt} Überkategorien angelegt, ${zugeordnet} Kategorien zugeordnet.` };
}

/** Seiten, auf denen Kategorien (und damit Überkategorien) sichtbar sind. */
function revalidatePathsForCategories() {
  for (const p of ["/categories", "/breakdown", "/budgets", "/plan-actual", "/plan-check", "/report", "/"]) {
    revalidatePath(p);
  }
}

/** Markiert eine Kategorie als neutralen Geldtransfer (oder wieder zurück). */
export async function toggleCategoryTransfer(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const c = await prisma.category.findUnique({ where: { id }, select: { isTransfer: true } });
  if (!c) return;
  await prisma.category.update({ where: { id }, data: { isTransfer: !c.isTransfer } });
  revalidatePath("/categories");
  revalidatePath("/breakdown");
  revalidatePath("/");
}

/** Soft-Delete: Kategorie 30 Tage wiederherstellbar in den Papierkorb legen. */
export async function deleteCategory(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Bei einer Überkategorie die Kinder vorher herauslösen – sie bleiben
  // vollwertige Kategorien und tauchen wieder ohne Gruppierung auf, statt an
  // einer gelöschten Klammer zu hängen.
  await prisma.category.updateMany({ where: { parentId: id }, data: { parentId: null } });
  await prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/categories");
  revalidatePath("/breakdown");
  revalidatePath("/");
}

/** Stellt eine soft-gelöschte Kategorie wieder her. */
export async function restoreCategory(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.category.update({ where: { id }, data: { deletedAt: null } });
  revalidatePath("/categories");
  revalidatePath("/breakdown");
  revalidatePath("/");
}

/** Endgültig löschen (aus dem Papierkorb). Regeln der Kategorie entfallen mit. */
export async function purgeCategory(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.category.delete({ where: { id } });
  revalidatePath("/categories");
}

const ruleSchema = z.object({
  categoryId: z.string().min(1, "Kategorie erforderlich"),
  conditions: z.string().min(1, "Bedingung erforderlich"),
  priority: z.string().optional(),
});

// Validiert den eingehenden Bedingungs-Baum (JSON) und gibt ihn geparst zurück.
function validateConditions(json: string): { tree: Node } | { error: string } {
  const tree = parseTree(json);
  if (!tree) return { error: "Ungültige oder leere Bedingung." };
  // Wurzel muss mindestens eine Bedingung enthalten.
  if (tree.type === "group" && tree.children.length === 0) {
    return { error: "Mindestens eine Bedingung angeben." };
  }
  return { tree };
}

export async function createRule(formData: FormData): Promise<FormState> {
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const d = parsed.data;
  const v = validateConditions(d.conditions);
  if ("error" in v) return { error: v.error };

  await prisma.rule.create({
    data: {
      categoryId: d.categoryId,
      conditions: v.tree as Prisma.InputJsonValue,
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

const ruleUpdateSchema = ruleSchema.extend({ id: z.string().min(1) });

export async function updateRule(formData: FormData): Promise<FormState> {
  const parsed = ruleUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const d = parsed.data;
  const v = validateConditions(d.conditions);
  if ("error" in v) return { error: v.error };

  await prisma.rule.update({
    where: { id: d.id },
    data: {
      categoryId: d.categoryId,
      conditions: v.tree as Prisma.InputJsonValue,
      priority: Number(d.priority) || 100,
    },
  });
  revalidatePath("/categories");
  return { ok: true };
}

export async function toggleRuleActive(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const rule = await prisma.rule.findUnique({ where: { id }, select: { active: true } });
  if (!rule) return;
  await prisma.rule.update({ where: { id }, data: { active: !rule.active } });
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
  const [ruleRows, txs] = await Promise.all([
    prisma.rule.findMany({ where: { active: true, category: { deletedAt: null } } }),
    prisma.transaction.findMany({
      where: { categoryId: null },
      select: { id: true, counterparty: true, purpose: true, amount: true, accountId: true, bookingDate: true },
    }),
  ]);
  const rules = ruleRows.map(toMatchableRule);
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
