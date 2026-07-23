// Richtet Geldtransfers ein (idempotent):
//  1. Kategorie "Geldtransfer" (neutral) sicherstellen.
//  2. Alle Umsätze der INTERNEN Konten (alle außer Girokonto) -> Geldtransfer.
//  3. Frühere Fehlpaarungen zurücknehmen: Giro-Umsätze, die faelschlich schon
//     Geldtransfer sind, zurücksetzen und per Regeln neu kategorisieren.
//  4. Giro-Gegenbuchungen der Ruecklagen ueber die KATEGORIE identifizieren
//     (Name beginnt mit "Rücklage") -> Geldtransfer. Zuverlaessig, keine
//     Betrags-Paarung, keine Fehltreffer bei Gehalt/Bewirtung.
//
// Container: TRANSFERS_APPLY=true  (GIRO_ACCOUNT="Geschäftskonto Postbank" Default).

import { prisma } from "@/lib/db";

async function main() {
  const giroName = process.env.GIRO_ACCOUNT || "Geschäftskonto Postbank";

  let cat = await prisma.category.findFirst({ where: { name: "Geldtransfer", deletedAt: null } });
  if (!cat) {
    cat = await prisma.category.create({ data: { name: "Geldtransfer", kind: "EXPENSE", color: "#94a3b8", isTransfer: true } });
    console.log('Kategorie "Geldtransfer" angelegt.');
  } else if (!cat.isTransfer) {
    cat = await prisma.category.update({ where: { id: cat.id }, data: { isTransfer: true } });
  }
  const gid = cat.id;

  const accounts = await prisma.account.findMany({ select: { id: true, name: true, archived: true } });
  const giro = accounts.find((a) => a.name === giroName);
  if (!giro) {
    console.error(`Girokonto "${giroName}" nicht gefunden. Vorhanden:`, accounts.map((a) => a.name).join(" | "));
    return;
  }
  const internal = accounts.filter((a) => a.id !== giro.id && !a.archived);
  const internalIds = internal.map((a) => a.id);
  console.log(`Girokonto: ${giro.name}`);
  console.log(`Interne Konten: ${internal.map((a) => a.name).join(", ") || "(keine)"}`);

  // 2. Interne Konten -> Geldtransfer.
  const r2 = await prisma.transaction.updateMany({ where: { accountId: { in: internalIds } }, data: { categoryId: gid } });
  console.log(`\n2) Interne Umsätze -> Geldtransfer: ${r2.count}`);

  // 3. Frühere Fehlpaarungen auf dem GIRO zurücknehmen und per Regeln neu setzen.
  const giroWrong = await prisma.transaction.findMany({
    where: { accountId: giro.id, categoryId: gid },
    select: { id: true, counterparty: true, purpose: true, amount: true },
  });
  if (giroWrong.length) {
    const { categorize } = await import("@/lib/categorize");
    const rules = await prisma.rule.findMany({ where: { active: true, category: { deletedAt: null, isTransfer: false } } });
    for (const t of giroWrong) {
      const newCat = categorize(t, rules); // Geldtransfer ist nicht unter den Regeln
      await prisma.transaction.update({ where: { id: t.id }, data: { categoryId: newCat } });
    }
    console.log(`3) Giro-Fehlpaarungen zurückgesetzt & neu kategorisiert: ${giroWrong.length}`);
  } else {
    console.log("3) Keine Giro-Fehlpaarungen.");
  }

  // 4. Giro-Rücklagen-Gegenbuchungen über die Kategorie (Name ~ "Rücklage").
  const ruecklageCats = await prisma.category.findMany({
    where: { name: { startsWith: "Rücklage" }, isTransfer: false },
    select: { id: true, name: true },
  });
  const rIds = ruecklageCats.map((c) => c.id);
  let giroRueck = 0;
  if (rIds.length) {
    const r4 = await prisma.transaction.updateMany({
      where: { accountId: giro.id, categoryId: { in: rIds } },
      data: { categoryId: gid },
    });
    giroRueck = r4.count;
  }
  console.log(`4) Giro-Rücklagen-Buchungen -> Geldtransfer: ${giroRueck}  (Quell-Kategorien: ${ruecklageCats.map((c) => c.name).join(", ") || "keine"})`);

  // 5. Kontrolle laufender Monat (einbezogene Konten, ohne Transfer).
  const now = new Date();
  const mStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const mEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const monthTx = await prisma.transaction.findMany({
    where: { bookingDate: { gte: mStart, lt: mEnd }, account: { archived: false, excludedFromCalc: false } },
    select: { amount: true, categoryId: true },
  });
  let inc = 0, exp = 0, incAll = 0, expAll = 0;
  for (const t of monthTx) {
    if (t.amount > 0) incAll += t.amount; else expAll += -t.amount;
    if (t.categoryId === gid) continue;
    if (t.amount > 0) inc += t.amount; else exp += -t.amount;
  }
  const eur = (c: number) => (c / 100).toFixed(2);
  console.log(`\n=== Kontrolle laufender Monat (einbezogene Konten) ===`);
  console.log(`  Zuflüsse mit Transfer:   ${eur(incAll)} €   ->  OHNE Transfer: ${eur(inc)} €`);
  console.log(`  Abflüsse  mit Transfer:  ${eur(expAll)} €   ->  OHNE Transfer: ${eur(exp)} €`);
  console.log("=== Ende ===\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
