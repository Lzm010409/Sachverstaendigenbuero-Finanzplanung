"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseStatement, type ImportFormat } from "@/lib/import";
import { importHash } from "@/lib/import/hash";
import { categorize } from "@/lib/categorize";

export interface ImportSummary {
  error?: string;
  format?: ImportFormat;
  parsed?: number;
  imported?: number;
  duplicates?: number;
  categorized?: number;
  warnings?: string[];
}

export async function importStatement(formData: FormData): Promise<ImportSummary> {
  const accountId = String(formData.get("accountId") ?? "");
  const file = formData.get("file");
  const formatOverride = String(formData.get("format") ?? "") as ImportFormat | "";

  if (!accountId) return { error: "Bitte ein Konto auswählen." };
  if (!(file instanceof File) || file.size === 0) return { error: "Bitte eine Datei auswählen." };
  if (file.size > 15 * 1024 * 1024) return { error: "Datei zu groß (max. 15 MB)." };

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return { error: "Konto nicht gefunden." };

  const content = await file.text();
  const result = parseStatement(file.name, content, formatOverride || undefined);
  if (result.transactions.length === 0) {
    return { error: "Keine Umsätze erkannt.", warnings: result.warnings, format: result.format };
  }

  const rules = await prisma.rule.findMany({ where: { active: true } });

  let imported = 0;
  let duplicates = 0;
  let categorized = 0;

  for (const tx of result.transactions) {
    const hash = importHash(accountId, tx);
    const categoryId = categorize(tx, rules);
    try {
      await prisma.transaction.create({
        data: {
          accountId,
          bookingDate: tx.bookingDate,
          valueDate: tx.valueDate ?? null,
          amount: tx.amount,
          counterparty: tx.counterparty,
          purpose: tx.purpose,
          importHash: hash,
          categoryId,
          raw: tx.raw ?? null,
        },
      });
      imported++;
      if (categoryId) categorized++;
    } catch (e) {
      // Unique-Constraint auf importHash => Duplikat, still überspringen
      if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002") {
        duplicates++;
      } else {
        throw e;
      }
    }
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/accounts");

  return {
    format: result.format,
    parsed: result.transactions.length,
    imported,
    duplicates,
    categorized,
    warnings: result.warnings,
  };
}
