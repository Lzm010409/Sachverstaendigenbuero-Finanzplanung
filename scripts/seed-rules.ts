// Legt Auto-Kategorisierungs-Regeln auf Basis der real vorkommenden
// Gegenparteien an (idempotent) und wendet sie auf alle noch nicht
// kategorisierten Umsätze an. Nutzt die vorhandenen Kategorien.
// Läuft im Container per SEED_RULES=true (Ausgabe über die Coolify-Logs) oder
// lokal via `npm run seed:rules`.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { categorize, toMatchableRule } from "@/lib/categorize";
import { parseTree, singleTextValue, textTree } from "@/lib/rule-expr";

// [Gegenpartei-Muster, Kategoriename, Priorität]. Kleinere Priorität zuerst.
// Spezifische Muster vor generischen. "A?" = Annahme, bitte prüfen.
const RULES: [pattern: string, category: string, priority: number][] = [
  // --- Kraftstoff / Laden ---
  ["Shell", "Benzin", 10],
  ["Worldline", "Benzin", 10], // im Bestand ausschließlich Shell-Tankungen
  ["ARAL", "Benzin", 10],
  ["Ionity", "Benzin", 10],
  ["SB Tank", "Benzin", 10],
  ["Maesmanns", "Benzin", 10],
  ["Tankstelle", "Benzin", 15],
  ["EnBW", "Benzin", 15], // A? Ladestrom E-Fahrzeuge

  // --- Telekommunikation ---
  ["Vodafone", "Mobil", 10],
  ["Telekom", "Internet", 10],
  ["STRATO", "Internet", 10],

  // --- Software / Lizenzen ---
  ["Google Cloud", "Software-Miete / Lizenzen", 10],
  ["Google", "Software-Miete / Lizenzen", 20],
  ["SevDesk", "Software-Miete / Lizenzen", 10],
  ["Anthropic", "Software-Miete / Lizenzen", 10],
  ["Apple Distribution", "Software-Miete / Lizenzen", 10],
  ["Paddle", "Software-Miete / Lizenzen", 10],
  ["Edge22", "Software-Miete / Lizenzen", 10],
  ["autoiXpert", "Software-Miete / Lizenzen", 10],
  ["AMAZON DIGITAL", "Software-Miete / Lizenzen", 10],
  ["Deutsche Automobil Treuhand", "Software-Miete / Lizenzen", 10], // DAT Bewertungsdaten
  ["CARTV", "Software-Miete / Lizenzen", 10],
  ["Classic Car Analytics", "Software-Miete / Lizenzen", 10],

  // --- Sonstige KFZ-Kosten (Werkstatt/Pflege/Handel) ---
  ["Krause Karosserie", "Sonstige KFZ-Kosten", 10],
  ["IMO AUTOPFLEGE", "Sonstige KFZ-Kosten", 10],
  ["Schoener Waschen", "Sonstige KFZ-Kosten", 10],
  ["Skach Motors", "Sonstige KFZ-Kosten", 10],
  ["Gottfried Schultz", "Sonstige KFZ-Kosten", 10],

  // --- Leasing ---
  ["BMW Bank", "Mietleasing Kfz", 10],
  ["VW Leasing", "Mietleasing Kfz", 10],
  ["VW-Bank", "Mietleasing Kfz", 10],
  ["Allane", "Mietleasing Kfz", 10],
  ["Mercedes-Benz Leasing", "Mietleasing Kfz", 10],

  // --- Versicherungen ---
  ["VW VERSICHERUNG", "KFZ-Versicherung", 10],
  ["ADAC Versicherung", "KFZ-Versicherung", 10],
  ["AXA Versicherung", "KFZ-Versicherung", 15], // A? Fuhrpark
  ["ROLAND Rechtsschutz", "Rechtschutz", 10],

  // --- Dienstleister / Beratung ---
  ["Eric Theissen", "Steuerberater", 10],
  ["ONREX", "Marketing / Werbekosten", 15], // A? Agentur

  // --- Sozialversicherung ---
  ["Knappschaft-Bahn-See", "Krankenkasse", 10],

  // --- Porto / Büro ---
  ["Deutsche Post", "Porto", 10],
  ["AMAZON PAYMENTS", "Bürobedarf", 15],
  ["AMAZON EU", "Bürobedarf", 15],

  // --- Bewirtung ---
  ["FISCHELNER BURGHOF", "Bewirtungskosten / Geschäftsessen", 10],
  ["AMALFI RESTAURANT", "Bewirtungskosten / Geschäftsessen", 10],
  ["SPITIKO", "Bewirtungskosten / Geschäftsessen", 10],
  ["RESTAURANT", "Bewirtungskosten / Geschäftsessen", 20],

  // --- Kapitalanlagen ---
  ["isin:", "Wertpapiere", 10],

  // --- Steuern ---
  ["Stadt Krefeld", "Gewerbesteuer", 10],
  ["Finanzamt Krefeld", "Umsatzsteuer-Vorauszahlungen, -Nachzahlungen, -Erstattungen", 15], // A?
  ["STEUERVERWALTUNG NRW", "Umsatzsteuer-Vorauszahlungen, -Nachzahlungen, -Erstattungen", 15], // A?

  // --- Zahlungsverkehr ---
  ["WORLDPAY", "Kontoführung / Kartengebühren", 15],
  ["V PAY", "Kontoführung / Kartengebühren", 15],

  // --- Gesellschafter / Familie (A? bitte prüfen: Gehalt vs. Entnahme) ---
  ["Thorsten Gollenstede", "Geschäftsführergehälter", 30],
  ["Gollenstede", "Privatentnahmen", 90], // fängt übrige Familientransfers
];

// Robuster Namensvergleich (Unicode NFC + kleingeschrieben), damit z.B.
// zusammengesetzte vs. zerlegte Umlaute (ä) sicher matchen.
const norm = (s: string) => s.normalize("NFC").trim().toLowerCase();

async function main() {
  const cats = await prisma.category.findMany({ select: { id: true, name: true, kind: true } });
  const byName = new Map(cats.map((c) => [norm(c.name), c.id]));
  const existing = await prisma.rule.findMany({ select: { conditions: true, categoryId: true } });
  const seen = new Set<string>();
  for (const r of existing) {
    const t = singleTextValue(parseTree(JSON.stringify(r.conditions)));
    if (t) seen.add(`${t.field}|${t.value.toLowerCase()}|${r.categoryId}`);
  }

  let created = 0, skippedDup = 0, missingCat = 0;
  for (const [pattern, catName, priority] of RULES) {
    const categoryId = byName.get(norm(catName));
    if (!categoryId) {
      console.log(`[seed-rules] Kategorie fehlt: "${catName}" (Muster "${pattern}")`);
      missingCat++;
      continue;
    }
    const key = `COUNTERPARTY|${pattern.toLowerCase()}|${categoryId}`;
    if (seen.has(key)) { skippedDup++; continue; }
    await prisma.rule.create({
      data: {
        categoryId,
        conditions: textTree("COUNTERPARTY", "CONTAINS", pattern) as unknown as Prisma.InputJsonValue,
        priority,
      },
    });
    seen.add(key);
    created++;
  }
  console.log(`[seed-rules] Regeln: ${created} neu, ${skippedDup} bereits vorhanden, ${missingCat} ohne Kategorie`);

  // Regeln maßgeblich anwenden: unkategorisierte Umsätze zuordnen UND bereits
  // (durch Regeln) zugeordnete Umsätze bei höher priorisierter Regel umziehen.
  // Umsätze in einer EINNAHME-Kategorie bleiben unangetastet (schützt die
  // bereits korrekte Erlös-Zuordnung).
  const incomeCatIds = new Set(cats.filter((c) => c.kind === "INCOME").map((c) => c.id));
  const rules = (await prisma.rule.findMany({ where: { active: true } })).map(toMatchableRule);
  const txs = await prisma.transaction.findMany({
    select: { id: true, counterparty: true, purpose: true, amount: true, categoryId: true },
  });
  const byCat = new Map<string, string[]>();
  for (const tx of txs) {
    if (tx.categoryId && incomeCatIds.has(tx.categoryId)) continue; // Erlöse schützen
    const categoryId = categorize(tx, rules);
    if (categoryId && categoryId !== tx.categoryId) {
      if (!byCat.has(categoryId)) byCat.set(categoryId, []);
      byCat.get(categoryId)!.push(tx.id);
    }
  }
  let updated = 0;
  for (const [categoryId, ids] of byCat) {
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      await prisma.transaction.updateMany({ where: { id: { in: chunk } }, data: { categoryId } });
      updated += chunk.length;
    }
  }
  const remaining = await prisma.transaction.count({ where: { categoryId: null } });
  console.log(`[seed-rules] Umsätze zugeordnet/umgezogen: ${updated}, weiterhin ohne Kategorie: ${remaining}`);

  // Verteilung je Kategorie (Top).
  const dist = await prisma.transaction.groupBy({
    by: ["categoryId"],
    _count: { _all: true },
    where: { categoryId: { not: null } },
  });
  const nameById = new Map(cats.map((c) => [c.id, c.name]));
  const top = dist.map((d) => ({ name: nameById.get(d.categoryId!) ?? d.categoryId, n: d._count._all }))
    .sort((a, b) => b.n - a.n).slice(0, 25);
  console.log("[seed-rules] Verteilung: " + top.map((t) => `${t.name}=${t.n}`).join(", "));
  console.log("[seed-rules] fertig.");
}

main().catch((e) => console.log("[seed-rules] Fehler:", (e as Error).message)).finally(() => process.exit(0));
