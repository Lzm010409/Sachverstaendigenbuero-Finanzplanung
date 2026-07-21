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
}

export async function deleteTransaction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.transaction.delete({ where: { id } });
  revalidatePath("/transactions");
  revalidatePath("/");
}
