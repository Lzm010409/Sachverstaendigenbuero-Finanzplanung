"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseStatement, type ImportFormat } from "@/lib/import";
import { importHash } from "@/lib/import/hash";
import { categorize } from "@/lib/categorize";

// Begrenzt Textlängen, damit Umsatzfelder den Speicher nicht unnötig aufblähen.
function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

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

  let categorized = 0;
  // Datensätze im Speicher vorbereiten (Text begrenzen, kategorisieren) und
  // per createMany in Blöcken einfügen – speicher- und WAL-schonend; Duplikate
  // werden über den Unique-Index (importHash) übersprungen.
  const data = result.transactions.map((tx) => {
    const categoryId = categorize(tx, rules);
    if (categoryId) categorized++;
    return {
      accountId,
      bookingDate: tx.bookingDate,
      valueDate: tx.valueDate ?? null,
      amount: tx.amount,
      counterparty: clip(tx.counterparty, 120),
      purpose: clip(tx.purpose, 180),
      importHash: importHash(accountId, tx),
      categoryId,
    };
  });

  let imported = 0;
  for (let i = 0; i < data.length; i += 500) {
    const res = await prisma.transaction.createMany({ data: data.slice(i, i + 500), skipDuplicates: true });
    imported += res.count;
  }
  const duplicates = data.length - imported;

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
