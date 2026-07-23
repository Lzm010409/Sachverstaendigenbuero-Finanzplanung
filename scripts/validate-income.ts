// Validiert die Einnahmen eines Monats gegen die Rohdaten: Zuflüsse je Konto
// (inkl. Archiv-/Ausschluss-Status) und je Kategorie. Deckt Doppelzählung durch
// zweite/duplizierte Konten auf. Läuft im Container per VALIDATE_INCOME=true
// (Monat via VALIDATE_MONTH=YYYY-MM, Standard 2026-07). Ausgabe über die Logs.

import { prisma } from "@/lib/db";

async function main() {
  const monthStr = process.env.VALIDATE_MONTH || "2026-07";
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));

  const txs = await prisma.transaction.findMany({
    where: { bookingDate: { gte: start, lt: end } },
    include: { account: { select: { name: true, archived: true, excludedFromCalc: true } }, category: { select: { name: true, kind: true } } },
  });

  const eur = (c: number) => (c / 100).toFixed(2);
  console.log(`\n=== Einnahmen-Validierung ${monthStr} (${txs.length} Umsätze gesamt) ===`);

  // je Konto
  const perAcc = new Map<string, { arch: boolean; excl: boolean; inflow: number; outflow: number; n: number }>();
  for (const t of txs) {
    const key = t.account.name;
    const a = perAcc.get(key) ?? { arch: t.account.archived, excl: t.account.excludedFromCalc, inflow: 0, outflow: 0, n: 0 };
    if (t.amount > 0) a.inflow += t.amount;
    else a.outflow += t.amount;
    a.n++;
    perAcc.set(key, a);
  }
  console.log("\n-- Zuflüsse je Konto --");
  for (const [name, a] of perAcc) {
    const flags = [a.arch ? "ARCHIVIERT" : null, a.excl ? "AUSGESCHLOSSEN" : null].filter(Boolean).join(",") || "in Berechnung";
    console.log(`  ${eur(a.inflow).padStart(12)} €  (${a.n} Umsätze)  [${flags}]  ${name}`);
  }

  // nur einbezogene Konten
  const included = txs.filter((t) => !t.account.archived && !t.account.excludedFromCalc);
  const inflowIncl = included.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const inflowAll = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  console.log(`\n  Zuflüsse gesamt (nur einbezogene Konten): ${eur(inflowIncl)} €  (${included.filter((t) => t.amount > 0).length} Umsätze)`);
  console.log(`  Zuflüsse gesamt (ALLE Konten):            ${eur(inflowAll)} €`);

  // je Kategorie (einbezogene Konten) – getrennt Zu-/Abfluss.
  const perCatIn = new Map<string, { v: number; n: number }>();
  const perCatOut = new Map<string, { v: number; n: number }>();
  for (const t of included) {
    const key = t.category?.name ?? "(ohne Kategorie)";
    const m = t.amount > 0 ? perCatIn : perCatOut;
    const c = m.get(key) ?? { v: 0, n: 0 };
    c.v += Math.abs(t.amount);
    c.n++;
    m.set(key, c);
  }
  console.log("\n-- Zuflüsse je Kategorie (einbezogene Konten) --");
  for (const [name, c] of [...perCatIn.entries()].sort((a, b) => b[1].v - a[1].v)) {
    console.log(`  ${eur(c.v).padStart(12)} €  (${c.n})  ${name}`);
  }
  console.log("-- Abflüsse je Kategorie (einbezogene Konten) --");
  for (const [name, c] of [...perCatOut.entries()].sort((a, b) => b[1].v - a[1].v)) {
    console.log(`  ${eur(c.v).padStart(12)} €  (${c.n})  ${name}`);
  }
  console.log("=== Ende ===\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
