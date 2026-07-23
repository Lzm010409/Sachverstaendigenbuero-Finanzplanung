// Abschluss-Aufräumung nach der Geldtransfer-Einführung (idempotent):
//  1. Kategorie "Geldtransit" ebenfalls als neutral (isTransfer) markieren.
//  2. Rücklage-Budgets (beide Seiten) soft-löschen – sie sind durch die
//     Transfer-Neutralisierung wirkungslos geworden (30 Tage wiederherstellbar).
// Container: CLEANUP_TRANSFERS=true

import { prisma } from "@/lib/db";

async function main() {
  const gt = await prisma.category.updateMany({ where: { name: "Geldtransit" }, data: { isTransfer: true } });
  console.log(`"Geldtransit" -> neutral: ${gt.count}`);

  const cats = await prisma.category.findMany({
    where: { name: { in: ["Rücklage Einnahme", "Rücklage Ausgaben"] } },
    select: { id: true, name: true },
  });
  const catIds = cats.map((c) => c.id);
  const budgets = await prisma.budget.findMany({
    where: { deletedAt: null, categoryId: { in: catIds } },
    select: { title: true, kind: true },
  });
  const res = await prisma.budget.updateMany({
    where: { deletedAt: null, categoryId: { in: catIds } },
    data: { deletedAt: new Date() },
  });
  console.log(`Rücklage-Budgets soft-gelöscht: ${res.count}`);
  for (const b of budgets) console.log(`  - [${b.kind}] ${b.title}`);

  const remaining = await prisma.budget.count({ where: { deletedAt: null } });
  console.log(`Verbleibende aktive Budgets: ${remaining}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
