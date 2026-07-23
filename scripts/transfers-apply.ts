// Richtet Geldtransfers ein: legt (falls nötig) die neutrale Kategorie
// "Geldtransfer" an, setzt ALLE Umsätze der internen Konten (alle außer dem
// Girokonto) darauf und paart die Giro-Gegenbuchungen (gleicher Betrag mit
// umgekehrtem Vorzeichen, Datum ±TOL Tage) dazu. So heben sich Transfers netto
// auf und verfälschen Ein-/Ausgaben nicht mehr.
//
// Container: TRANSFERS_APPLY=true  (GIRO_ACCOUNT="Geschäftskonto Postbank" Default,
// PAIR_TOL_DAYS=2 Default). Ausgabe über die Logs. Idempotent.

import { prisma } from "@/lib/db";

async function main() {
  const giroName = process.env.GIRO_ACCOUNT || "Geschäftskonto Postbank";
  const tolDays = Number(process.env.PAIR_TOL_DAYS ?? "2");
  const DAY = 86_400_000;

  // 1. Kategorie "Geldtransfer" (neutral) sicherstellen.
  let cat = await prisma.category.findFirst({ where: { name: "Geldtransfer", deletedAt: null } });
  if (!cat) {
    cat = await prisma.category.create({ data: { name: "Geldtransfer", kind: "EXPENSE", color: "#94a3b8", isTransfer: true } });
    console.log('Kategorie "Geldtransfer" angelegt (neutral).');
  } else if (!cat.isTransfer) {
    cat = await prisma.category.update({ where: { id: cat.id }, data: { isTransfer: true } });
    console.log('Kategorie "Geldtransfer" auf neutral gesetzt.');
  } else {
    console.log('Kategorie "Geldtransfer" vorhanden.');
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

  // 2a. Alle internen Umsätze -> Geldtransfer.
  const internalTxs = await prisma.transaction.findMany({
    where: { accountId: { in: internalIds } },
    select: { id: true, amount: true, bookingDate: true, counterparty: true },
  });
  await prisma.transaction.updateMany({ where: { accountId: { in: internalIds } }, data: { categoryId: gid } });
  console.log(`\nInterne Umsätze -> Geldtransfer: ${internalTxs.length}`);

  // 2b. Giro-Gegenbuchungen paaren (Betrag = -intern, Datum am nächsten, <= tol Tage).
  const giroTxs = await prisma.transaction.findMany({
    where: { accountId: giro.id, NOT: { categoryId: gid } },
    select: { id: true, amount: true, bookingDate: true, counterparty: true },
  });
  const byAmt = new Map<number, { id: string; t: number; cp: string }[]>();
  for (const g of giroTxs) {
    const arr = byAmt.get(g.amount) ?? [];
    arr.push({ id: g.id, t: g.bookingDate.getTime(), cp: g.counterparty });
    byAmt.set(g.amount, arr);
  }
  const used = new Set<string>();
  const pairIds: string[] = [];
  const report: string[] = [];
  let unmatched = 0;
  for (const it of internalTxs) {
    const cands = byAmt.get(-it.amount) ?? [];
    let best: { id: string; t: number; cp: string } | null = null;
    for (const c of cands) {
      if (used.has(c.id)) continue;
      const diff = Math.abs(c.t - it.bookingDate.getTime());
      if (diff <= tolDays * DAY && (!best || diff < Math.abs(best.t - it.bookingDate.getTime()))) best = c;
    }
    if (best) {
      used.add(best.id);
      pairIds.push(best.id);
      report.push(`  ${(it.amount / 100).toFixed(2).padStart(10)} €  ${new Date(it.bookingDate).toISOString().slice(0, 10)}  intern:${it.counterparty.slice(0, 20)}  <->  giro:${best.cp.slice(0, 20)}`);
    } else {
      unmatched++;
    }
  }
  for (let i = 0; i < pairIds.length; i += 500) {
    await prisma.transaction.updateMany({ where: { id: { in: pairIds.slice(i, i + 500) } }, data: { categoryId: gid } });
  }
  console.log(`Giro-Gegenbuchungen gepaart -> Geldtransfer: ${pairIds.length} (ohne Partner: ${unmatched})`);
  console.log("Paarungen (Kontrolle):");
  for (const r of report.slice(0, 60)) console.log(r);

  // 3. Kontrollrechnung laufender Monat (einbezogene Konten, ohne Transfer).
  const now = new Date();
  const mStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const mEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const monthTx = await prisma.transaction.findMany({
    where: { bookingDate: { gte: mStart, lt: mEnd }, account: { archived: false, excludedFromCalc: false } },
    select: { amount: true, categoryId: true },
  });
  let inc = 0, exp = 0, incAll = 0;
  for (const t of monthTx) {
    if (t.amount > 0) incAll += t.amount;
    if (t.categoryId === gid) continue;
    if (t.amount > 0) inc += t.amount;
    else exp += -t.amount;
  }
  const eur = (c: number) => (c / 100).toFixed(2);
  console.log(`\n=== Kontrolle laufender Monat (einbezogene Konten) ===`);
  console.log(`  Zuflüsse gesamt (mit Transfer):  ${eur(incAll)} €`);
  console.log(`  Einnahmen OHNE Transfer:         ${eur(inc)} €`);
  console.log(`  Ausgaben OHNE Transfer:          ${eur(exp)} €`);
  console.log("=== Ende ===\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
