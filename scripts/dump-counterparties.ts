// Diagnose: aggregiert die vorhandenen Transaktionen nach Gegenpartei, um daraus
// sinnvolle Kategorien/Regeln abzuleiten. Läuft im Container per DUMP_CP=true
// (Ausgabe über die Coolify-Logs) oder lokal via tsx. Enthält reale Namen –
// nur fürs eigene System.

import { prisma } from "@/lib/db";

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

async function main() {
  const [total, uncategorized, cats] = await Promise.all([
    prisma.transaction.count(),
    prisma.transaction.count({ where: { categoryId: null } }),
    prisma.category.findMany({ include: { _count: { select: { transactions: true } } }, orderBy: { name: "asc" } }),
  ]);
  console.log(`[dump] Transaktionen gesamt=${total}, ohne Kategorie=${uncategorized}`);
  console.log(`[dump] Kategorien (${cats.length}): ` + cats.map((c) => `${c.name}[${c.kind}]=${c._count.transactions}`).join(", "));

  // Nur unkategorisierte betrachten, gruppiert nach normalisierter Gegenpartei.
  const txs = await prisma.transaction.findMany({
    where: { categoryId: null },
    select: { counterparty: true, purpose: true, amount: true },
  });

  const map = new Map<string, { raw: string; count: number; sum: number; inc: number; exp: number }>();
  for (const t of txs) {
    const key = norm(t.counterparty || "(leer)");
    const e = map.get(key) ?? { raw: t.counterparty || "(leer)", count: 0, sum: 0, inc: 0, exp: 0 };
    e.count++;
    e.sum += t.amount;
    if (t.amount >= 0) e.inc++; else e.exp++;
    map.set(key, e);
  }

  const sorted = [...map.values()].sort((a, b) => b.count - a.count);
  console.log(`[dump] eindeutige Gegenparteien (unkategorisiert): ${sorted.length}`);
  console.log(`[dump] TOP 80 nach Häufigkeit (raw | count | summe€ | #ein/#aus):`);
  for (const e of sorted.slice(0, 80)) {
    console.log(`[dump]   ${JSON.stringify(e.raw).slice(0, 60)} | ${e.count} | ${(e.sum / 100).toFixed(2)} | ${e.inc}/${e.exp}`);
  }
  console.log("[dump] fertig.");
}

main().catch((e) => console.log("[dump] Fehler:", (e as Error).message)).finally(() => process.exit(0));
