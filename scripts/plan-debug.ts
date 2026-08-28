// Diagnose der Planposten (v. a. Quartals-/Steuerposten): listet alle Planposten
// mit Rhythmus/Startdatum/Kategorie/Transfer-Flag und zeigt die nächsten
// Fälligkeiten der nächsten 12 Monate. Zusätzlich Steuer-Budgets und
// Transfer-Kategorien. READ-ONLY. Gated per PLAN_DEBUG=true (Ausgabe via Logs).

import { prisma } from "@/lib/db";
import { occurrencesBetween } from "@/lib/recurrence";
import { todayUTC, addMonths } from "@/lib/dates";

const eur = (c: number) => (c / 100).toFixed(2);
const d = (x: Date | null | undefined) => (x ? new Date(x).toISOString().slice(0, 10) : "—");

async function main() {
  const today = todayUTC();
  const in12 = addMonths(today, 12);

  const planned = await prisma.plannedItem.findMany({
    include: { category: { select: { name: true, isTransfer: true, deletedAt: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  console.log(`\n=== PLANPOSTEN (${planned.length}) — heute ${d(today)} ===`);
  for (const p of planned) {
    const occ = occurrencesBetween(p, today, in12).map((x) => d(x));
    const flags = [
      p.active ? null : "INAKTIV",
      p.category?.isTransfer ? "KATEGORIE=TRANSFER(!)" : null,
      p.category?.deletedAt ? "KATEGORIE GELÖSCHT" : null,
    ].filter(Boolean).join(" ");
    console.log(
      `- "${p.name}" | ${eur(p.amount)} € | ${p.recurrence}/int${p.interval} | ab ${d(p.startDate)} bis ${d(p.endDate)} | Kat: ${p.category?.name ?? "—"} ${flags}`,
    );
    console.log(`    nächste 12 Monate (${occ.length}): ${occ.join(", ") || "KEINE"}`);
  }

  // Steuer-relevante Budgets (falls fälschlich als Budget statt Planposten)
  const budgets = await prisma.budget.findMany({
    where: { deletedAt: null, title: { contains: "steuer", mode: "insensitive" } },
    include: { category: { select: { name: true } } },
  });
  console.log(`\n=== STEUER-BUDGETS (Titel enthält "steuer") (${budgets.length}) ===`);
  for (const b of budgets) {
    console.log(`- "${b.title}" | ${eur(b.amount)} €/${b.period} | ab ${d(b.startDate)} bis ${d(b.endDate)} | inForecast=${b.includeInForecast} | active=${b.active} | Kat: ${b.category?.name ?? "—"}`);
  }

  // Transfer-Kategorien (die aus Prognose/Übersicht ausgeschlossen sind)
  const transfers = await prisma.category.findMany({ where: { isTransfer: true, deletedAt: null }, select: { name: true } });
  console.log(`\n=== TRANSFER-KATEGORIEN (neutral, aus Prognose ausgeschlossen) (${transfers.length}) ===`);
  console.log("  " + (transfers.map((t) => t.name).join(", ") || "keine"));

  console.log("\n=== Ende ===\n");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
