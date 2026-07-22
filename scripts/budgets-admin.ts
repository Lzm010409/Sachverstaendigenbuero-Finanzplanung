// Budget-Administration im Container (Ausgabe über die Coolify-Logs).
//   BUDGETS_ADMIN=true                      -> listet alle Budgets (Diagnose)
//   BUDGETS_ADMIN=true BUDGETS_IMPORT='[…]' -> legt Budgets aus JSON an (idempotent nach Titel)
//
// JSON-Element:
//   {
//     "title": "Rücklage Steuer",
//     "kind": "EXPENSE",              // INCOME | EXPENSE
//     "amountEur": 3000,              // Betrag je Periode in EUR (Vorzeichen egal)
//     "period": "MONTHLY",            // WEEKLY | MONTHLY | QUARTERLY | YEARLY (Default MONTHLY)
//     "categoryName": "Steuern",      // optional; wird nach Name gematcht
//     "startDate": "2025-12-01",      // optional (YYYY-MM-DD)
//     "endDate": "2026-12-31",        // optional
//     "includeInForecast": true        // optional (Default false)
//   }

import { prisma } from "@/lib/db";

type Period = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
type Kind = "INCOME" | "EXPENSE";

interface BudgetDef {
  title: string;
  kind: Kind;
  amountEur: number;
  period?: Period;
  categoryName?: string;
  startDate?: string;
  endDate?: string;
  includeInForecast?: boolean;
}

function parseDate(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? null : d;
}

async function listCategories() {
  const cats = await prisma.category.findMany({
    where: { deletedAt: null },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: { name: true, kind: true },
  });
  console.log(`\n=== Kategorien: ${cats.length} ===`);
  for (const c of cats) console.log(`- [${c.kind}] ${c.name}`);
  console.log("=== Ende Kategorien ===\n");
}

async function list() {
  const budgets = await prisma.budget.findMany({
    orderBy: [{ deletedAt: "asc" }, { kind: "asc" }, { title: "asc" }],
    include: { category: { select: { name: true } } },
  });
  console.log(`\n=== Budgets: ${budgets.length} gesamt ===`);
  for (const b of budgets) {
    const eur = (b.amount / 100).toFixed(2);
    const range = [b.startDate, b.endDate].some(Boolean)
      ? `${b.startDate?.toISOString().slice(0, 10) ?? "…"}–${b.endDate?.toISOString().slice(0, 10) ?? "…"}`
      : "unbefristet";
    console.log(
      `- [${b.kind}] ${b.title} | ${eur} €/${b.period} | Kat: ${b.category?.name ?? "—"} | ${range} | ` +
        `${b.active ? "aktiv" : "inaktiv"}${b.includeInForecast ? " | in Prognose" : ""}${b.deletedAt ? " | GELÖSCHT" : ""}`,
    );
  }
  console.log("=== Ende ===\n");
}

async function importBudgets(raw: string) {
  let defs: BudgetDef[];
  try {
    defs = JSON.parse(raw);
    if (!Array.isArray(defs)) throw new Error("kein Array");
  } catch (e) {
    console.error("BUDGETS_IMPORT ist kein gültiges JSON-Array:", (e as Error).message);
    return;
  }

  const cats = await prisma.category.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  const catByName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c.id]));

  let created = 0;
  let skipped = 0;
  for (const d of defs) {
    if (!d.title || !d.kind || typeof d.amountEur !== "number") {
      console.warn("übersprungen (Pflichtfeld fehlt):", JSON.stringify(d));
      skipped++;
      continue;
    }
    const exists = await prisma.budget.findFirst({
      where: { title: d.title, kind: d.kind, deletedAt: null },
      select: { id: true },
    });
    if (exists) {
      console.log(`bereits vorhanden, übersprungen: ${d.title}`);
      skipped++;
      continue;
    }
    const categoryId = d.categoryName ? catByName.get(d.categoryName.trim().toLowerCase()) ?? null : null;
    if (d.categoryName && !categoryId) {
      console.warn(`Kategorie „${d.categoryName}" nicht gefunden – Budget „${d.title}" wird ohne Kategorie angelegt.`);
    }
    await prisma.budget.create({
      data: {
        title: d.title,
        kind: d.kind,
        amount: Math.abs(Math.round(d.amountEur * 100)),
        period: d.period ?? "MONTHLY",
        categoryId,
        startDate: parseDate(d.startDate),
        endDate: parseDate(d.endDate),
        includeInForecast: d.includeInForecast ?? false,
      },
    });
    created++;
    console.log(`angelegt: [${d.kind}] ${d.title} (${d.amountEur} €/${d.period ?? "MONTHLY"})`);
  }
  console.log(`\nImport fertig: ${created} angelegt, ${skipped} übersprungen.\n`);
}

interface RecatInput {
  createCategories?: { name: string; kind: Kind; color?: string }[];
  assign?: { title: string; kind: Kind; categoryName: string }[];
}

// Kategorien anlegen (falls fehlend) und Budgets per (Titel, Art) umhängen.
async function recategorize(raw: string) {
  let input: RecatInput;
  try {
    input = JSON.parse(raw);
  } catch (e) {
    console.error("BUDGETS_RECAT ist kein gültiges JSON:", (e as Error).message);
    return;
  }

  for (const c of input.createCategories ?? []) {
    const existing = await prisma.category.findFirst({ where: { name: c.name, deletedAt: null } });
    if (existing) {
      console.log(`Kategorie vorhanden: ${c.name}`);
      continue;
    }
    await prisma.category.create({ data: { name: c.name, kind: c.kind, color: c.color ?? "#64748b" } });
    console.log(`Kategorie angelegt: [${c.kind}] ${c.name}`);
  }

  const cats = await prisma.category.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  const catByName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c.id]));

  for (const a of input.assign ?? []) {
    const categoryId = catByName.get(a.categoryName.trim().toLowerCase());
    if (!categoryId) {
      console.warn(`Kategorie „${a.categoryName}" nicht gefunden – ${a.title} unverändert.`);
      continue;
    }
    const res = await prisma.budget.updateMany({
      where: { title: a.title, kind: a.kind, deletedAt: null },
      data: { categoryId },
    });
    console.log(`umgehängt: ${a.title} -> ${a.categoryName} (${res.count} Budget[s])`);
  }
}

async function main() {
  const recatB64 = process.env.BUDGETS_RECAT_B64;
  if (recatB64 && recatB64.trim()) {
    await recategorize(Buffer.from(recatB64.trim(), "base64").toString("utf8"));
  }

  // Import-JSON entweder direkt (BUDGETS_IMPORT) oder base64-kodiert
  // (BUDGETS_IMPORT_B64, umgeht Quoting-Probleme beim Env-Transport).
  let raw = process.env.BUDGETS_IMPORT;
  const b64 = process.env.BUDGETS_IMPORT_B64;
  if ((!raw || !raw.trim()) && b64 && b64.trim()) {
    raw = Buffer.from(b64.trim(), "base64").toString("utf8");
  }
  if (raw && raw.trim().length > 0) {
    await importBudgets(raw);
  }
  // Nach dem Import (oder ohne Import) immer den aktuellen Stand ausgeben.
  await listCategories();
  await list();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
