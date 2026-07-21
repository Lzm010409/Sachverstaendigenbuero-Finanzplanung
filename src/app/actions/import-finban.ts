"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseFinbanCsv } from "@/lib/import/finban";
import { importHash } from "@/lib/import/hash";

export interface FinbanImportSummary {
  error?: string;
  parsed?: number;
  accounts?: number;
  categories?: number;
  transactions?: number;
  planned?: number;
  duplicates?: number;
  replaced?: boolean;
  warnings?: string[];
}

const BOOKED = new Set(["gebucht", "rückerstattung - überweisung"]);

export async function importFinban(formData: FormData): Promise<FinbanImportSummary> {
  const file = formData.get("file");
  const replace = String(formData.get("replace") ?? "") === "on";
  if (!(file instanceof File) || file.size === 0) return { error: "Bitte eine finban-CSV auswählen." };
  if (file.size > 25 * 1024 * 1024) return { error: "Datei zu groß (max. 25 MB)." };

  const { records, warnings } = parseFinbanCsv(await file.text());
  if (records.length === 0) return { error: "Keine Datensätze erkannt.", warnings };

  // Kategorie-Art anhand des Netto-Vorzeichens bestimmen.
  const catNet = new Map<string, number>();
  for (const r of records) {
    if (!r.category) continue;
    catNet.set(r.category, (catNet.get(r.category) ?? 0) + r.amount);
  }
  const sources = [...new Set(records.filter((r) => !r.planned && r.source).map((r) => r.source))];
  // Frühestes Buchungsdatum je Konto -> wird zum Stichtag (Anfangssaldo 0),
  // damit alle importierten Umsätze in den Saldo einfließen.
  const earliestBySource = new Map<string, Date>();
  for (const r of records) {
    if (r.planned || !r.source) continue;
    const cur = earliestBySource.get(r.source);
    if (!cur || r.date.getTime() < cur.getTime()) earliestBySource.set(r.source, r.date);
  }

  if (replace) {
    // Bestehende (Demo-)Daten entfernen. Szenarien bleiben erhalten.
    await prisma.transaction.deleteMany({});
    await prisma.plannedItem.deleteMany({});
    await prisma.openItem.deleteMany({});
    await prisma.rule.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.account.deleteMany({});
  }

  // Konten anlegen/holen
  const accountId = new Map<string, string>();
  for (const name of sources) {
    const existing = await prisma.account.findFirst({ where: { name } });
    const acc =
      existing ??
      (await prisma.account.create({
        data: {
          name,
          type: "CHECKING",
          openingBalance: 0,
          openingDate: earliestBySource.get(name) ?? new Date(),
        },
      }));
    accountId.set(name, acc.id);
  }
  const fallbackAccount =
    accountId.values().next().value ??
    (await prisma.account.create({ data: { name: "finban-Import" } })).id;

  // Kategorien anlegen/holen
  const categoryId = new Map<string, string>();
  for (const [name, net] of catNet) {
    const existing = await prisma.category.findFirst({ where: { name } });
    const cat =
      existing ??
      (await prisma.category.create({
        data: { name, kind: net >= 0 ? "INCOME" : "EXPENSE" },
      }));
    categoryId.set(name, cat.id);
  }

  let transactions = 0;
  let planned = 0;
  let duplicates = 0;
  let rowIndex = 0;

  for (const r of records) {
    const catId = r.category ? categoryId.get(r.category) ?? null : null;
    if (r.planned) {
      await prisma.plannedItem.create({
        data: {
          name: r.title || "finban-Planung",
          amount: r.amount,
          recurrence: "ONCE",
          interval: 1,
          startDate: r.date,
          categoryId: catId,
          note: "Import finban",
        },
      });
      planned++;
      continue;
    }
    if (!BOOKED.has(r.status.toLowerCase()) && r.status !== "") {
      // unbekannter Status – trotzdem als Umsatz behandeln
    }
    const accId = accountId.get(r.source) ?? fallbackAccount;
    const tx = {
      bookingDate: r.date,
      valueDate: r.date,
      amount: r.amount,
      counterparty: r.contact || r.title,
      purpose: r.title,
    };
    // Zeilen-Index im Hash: behält identische Zeilen als eigene Buchungen,
    // dedupliziert aber beim erneuten Import derselben (gleich sortierten) Datei.
    const hash = `${importHash(accId, tx)}-fb${rowIndex++}`;
    try {
      await prisma.transaction.create({
        data: {
          accountId: accId,
          ...tx,
          categoryId: catId,
          importHash: hash,
          raw: "finban-Import",
        },
      });
      transactions++;
    } catch (e) {
      if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002") {
        duplicates++;
      } else throw e;
    }
  }

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/breakdown");
  revalidatePath("/accounts");
  revalidatePath("/categories");

  return {
    parsed: records.length,
    accounts: sources.length,
    categories: catNet.size,
    transactions,
    planned,
    duplicates,
    replaced: replace,
    warnings,
  };
}
