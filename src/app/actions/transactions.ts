"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function setTransactionCategory(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!id) return;
  await prisma.transaction.update({
    where: { id },
    data: { categoryId: categoryId || null },
  });
  revalidatePath("/transactions");
  revalidatePath("/");
}

/** Ordnet mehrere Umsätze auf einmal einer Kategorie zu (Multiselect). */
export async function bulkSetTransactionCategory(
  ids: string[],
  categoryId: string | null,
): Promise<{ updated: number }> {
  const clean = ids.filter(Boolean);
  if (clean.length === 0) return { updated: 0 };
  const res = await prisma.transaction.updateMany({
    where: { id: { in: clean } },
    data: { categoryId: categoryId || null },
  });
  revalidatePath("/transactions");
  revalidatePath("/");
  return { updated: res.count };
}

export async function deleteTransaction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.transaction.delete({ where: { id } });
  revalidatePath("/transactions");
  revalidatePath("/");
}
