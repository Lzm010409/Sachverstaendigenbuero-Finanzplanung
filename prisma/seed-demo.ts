import { PrismaClient } from "@prisma/client";

// Realistische Demo-Daten für ein Sachverständigenbüro.
// Idempotent: läuft nur, wenn noch keine Konten existieren (überspringt sonst),
// damit ein erneuter Container-Start keine Duplikate erzeugt.

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
function inDays(n: number): Date {
  return daysAgo(-n);
}
function firstOfMonth(offset: number): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
}

// Jahresbudgets je Kategorie (in Euro) für die Demo.
const BUDGETS_EUR: Record<string, number> = {
  "Honorare / Gutachten": 60000,
  "Sonstige Einnahmen": 6000,
  "Miete / Büro": 17400,
  "Gehälter / Personal": 38400,
  Versicherungen: 1200,
  "Kfz / Reisekosten": 1800,
  "Software / IT": 2400,
  "Steuern / Abgaben": 8400,
  Bankgebühren: 200,
};

// Setzt Budgets auf Demo-Kategorien, die noch keines haben (idempotent).
async function ensureBudgets() {
  for (const [name, eur] of Object.entries(BUDGETS_EUR)) {
    await prisma.category.updateMany({
      where: { name, annualBudget: 0 },
      data: { annualBudget: Math.round(eur * 100) },
    });
  }
}

async function main() {
  const existing = await prisma.account.count();
  const demoAccount = await prisma.account.findFirst({ where: { name: "Geschäftskonto" } });
  if (existing > 0) {
    // Bei bestehender Demo-Umgebung nur die Budgets nachziehen.
    if (demoAccount) {
      await ensureBudgets();
      console.log("Demo-Seed: Konten vorhanden – Budgets für Demo-Kategorien aktualisiert.");
    } else {
      console.log(`Demo-Seed übersprungen: es existieren bereits ${existing} Konten.`);
    }
    return;
  }

  // --- Konten ---
  const giro = await prisma.account.create({
    data: {
      name: "Geschäftskonto",
      type: "CHECKING",
      iban: "DE12 3456 7890 1234 5678 00",
      openingBalance: 800000, // 8.000 €
      openingDate: daysAgo(95),
    },
  });
  const tagesgeld = await prisma.account.create({
    data: {
      name: "Rücklagen (Tagesgeld)",
      type: "SAVINGS",
      openingBalance: 2500000, // 25.000 €
      openingDate: daysAgo(95),
    },
  });

  // --- Kategorien ---
  const catDefs: { name: string; kind: "INCOME" | "EXPENSE"; color: string }[] = [
    { name: "Honorare / Gutachten", kind: "INCOME", color: "#0f766e" },
    { name: "Sonstige Einnahmen", kind: "INCOME", color: "#0d9488" },
    { name: "Miete / Büro", kind: "EXPENSE", color: "#b45309" },
    { name: "Gehälter / Personal", kind: "EXPENSE", color: "#7c3aed" },
    { name: "Versicherungen", kind: "EXPENSE", color: "#2563eb" },
    { name: "Kfz / Reisekosten", kind: "EXPENSE", color: "#dc2626" },
    { name: "Software / IT", kind: "EXPENSE", color: "#0891b2" },
    { name: "Steuern / Abgaben", kind: "EXPENSE", color: "#475569" },
    { name: "Bankgebühren", kind: "EXPENSE", color: "#64748b" },
  ];
  const cat: Record<string, string> = {};
  for (const c of catDefs) {
    const created = await prisma.category.create({ data: c });
    cat[c.name] = created.id;
  }

  // --- Auto-Regeln ---
  await prisma.rule.createMany({
    data: [
      { categoryId: cat["Miete / Büro"], field: "PURPOSE", pattern: "miete", priority: 10 },
      { categoryId: cat["Versicherungen"], field: "PURPOSE", pattern: "versicherung", priority: 20 },
      { categoryId: cat["Kfz / Reisekosten"], field: "PURPOSE", pattern: "tankstelle", priority: 30 },
      { categoryId: cat["Steuern / Abgaben"], field: "COUNTERPARTY", pattern: "finanzamt", priority: 40 },
      { categoryId: cat["Software / IT"], field: "COUNTERPARTY", pattern: "/microsoft|adobe|datev/", priority: 50 },
    ],
  });

  // --- Umsätze der letzten ~3 Monate ---
  type Tx = {
    day: number;
    amount: number;
    counterparty: string;
    purpose: string;
    category: string;
  };
  const txs: Tx[] = [
    // Einnahmen (Honorare)
    { day: 88, amount: 285000, counterparty: "Amtsgericht Oldenburg", purpose: "Honorar Gutachten 2026-071", category: "Honorare / Gutachten" },
    { day: 76, amount: 168000, counterparty: "HUK-Coburg Vers. AG", purpose: "Schadengutachten Kfz W-2026-088", category: "Honorare / Gutachten" },
    { day: 64, amount: 342000, counterparty: "Landgericht Bremen", purpose: "Gerichtsgutachten 4 O 233/25", category: "Honorare / Gutachten" },
    { day: 52, amount: 119000, counterparty: "Allianz Versicherung", purpose: "Wertgutachten Immobilie", category: "Honorare / Gutachten" },
    { day: 40, amount: 226000, counterparty: "Amtsgericht Oldenburg", purpose: "Honorar Gutachten 2026-094", category: "Honorare / Gutachten" },
    { day: 28, amount: 91000, counterparty: "Privatkunde Meyer", purpose: "Privatgutachten Bauschaden", category: "Honorare / Gutachten" },
    { day: 16, amount: 305000, counterparty: "R+V Versicherung", purpose: "Kfz-Schadengutachten Serie", category: "Honorare / Gutachten" },
    { day: 6, amount: 47600, counterparty: "Erstattung Reisekosten", purpose: "Auslagen Gerichtstermin", category: "Sonstige Einnahmen" },
    // Ausgaben
    { day: 90, amount: -145000, counterparty: "Vermietung Nordstr. GbR", purpose: "Büro Miete", category: "Miete / Büro" },
    { day: 90, amount: -320000, counterparty: "Gehalt M. Schulz", purpose: "Gehalt Mitarbeiter", category: "Gehälter / Personal" },
    { day: 85, amount: -28000, counterparty: "VHV Versicherung", purpose: "Berufshaftpflicht Versicherung", category: "Versicherungen" },
    { day: 82, amount: -8990, counterparty: "Microsoft Ireland", purpose: "Microsoft 365 Business", category: "Software / IT" },
    { day: 78, amount: -12450, counterparty: "Aral Tankstelle", purpose: "Tankstelle Dienstwagen", category: "Kfz / Reisekosten" },
    { day: 72, amount: -1490, counterparty: "Sparkasse", purpose: "Kontoführung Bankgebühren", category: "Bankgebühren" },
    { day: 60, amount: -145000, counterparty: "Vermietung Nordstr. GbR", purpose: "Büro Miete", category: "Miete / Büro" },
    { day: 60, amount: -320000, counterparty: "Gehalt M. Schulz", purpose: "Gehalt Mitarbeiter", category: "Gehälter / Personal" },
    { day: 55, amount: -210000, counterparty: "Finanzamt Oldenburg", purpose: "Umsatzsteuer-Vorauszahlung", category: "Steuern / Abgaben" },
    { day: 48, amount: -14790, counterparty: "DATEV eG", purpose: "DATEV Buchhaltung", category: "Software / IT" },
    { day: 44, amount: -9800, counterparty: "Aral Tankstelle", purpose: "Tankstelle Dienstwagen", category: "Kfz / Reisekosten" },
    { day: 30, amount: -145000, counterparty: "Vermietung Nordstr. GbR", purpose: "Büro Miete", category: "Miete / Büro" },
    { day: 30, amount: -320000, counterparty: "Gehalt M. Schulz", purpose: "Gehalt Mitarbeiter", category: "Gehälter / Personal" },
    { day: 24, amount: -8990, counterparty: "Microsoft Ireland", purpose: "Microsoft 365 Business", category: "Software / IT" },
    { day: 20, amount: -6500, counterparty: "Deutsche Post AG", purpose: "Porto und Versand", category: "Sonstige Einnahmen" },
    { day: 12, amount: -1490, counterparty: "Sparkasse", purpose: "Kontoführung Bankgebühren", category: "Bankgebühren" },
    { day: 8, amount: -11200, counterparty: "Aral Tankstelle", purpose: "Tankstelle Dienstwagen", category: "Kfz / Reisekosten" },
  ];

  let i = 0;
  for (const t of txs) {
    const date = daysAgo(t.day);
    await prisma.transaction.create({
      data: {
        accountId: giro.id,
        bookingDate: date,
        valueDate: date,
        amount: t.amount,
        counterparty: t.counterparty,
        purpose: t.purpose,
        categoryId: cat[t.category] ?? null,
        importHash: `demo-${giro.id}-${i++}`,
        raw: "Demo-Datensatz",
      },
    });
  }

  // --- Geplante (wiederkehrende) Buchungen ---
  await prisma.plannedItem.createMany({
    data: [
      { name: "Büromiete", amount: -145000, recurrence: "MONTHLY", interval: 1, startDate: firstOfMonth(1), categoryId: cat["Miete / Büro"] },
      { name: "Gehalt Mitarbeiter", amount: -320000, recurrence: "MONTHLY", interval: 1, startDate: firstOfMonth(1), categoryId: cat["Gehälter / Personal"] },
      { name: "Honorar-Dauerauftrag (Schätzung)", amount: 450000, recurrence: "MONTHLY", interval: 1, startDate: inDays(12), categoryId: cat["Honorare / Gutachten"] },
      { name: "Berufshaftpflicht", amount: -28000, recurrence: "QUARTERLY", interval: 1, startDate: inDays(25), categoryId: cat["Versicherungen"] },
      { name: "Steuervorauszahlung", amount: -210000, recurrence: "QUARTERLY", interval: 1, startDate: inDays(40), categoryId: cat["Steuern / Abgaben"] },
      { name: "Microsoft 365", amount: -8990, recurrence: "MONTHLY", interval: 1, startDate: inDays(20), categoryId: cat["Software / IT"] },
    ],
  });

  // --- Offene Posten ---
  await prisma.openItem.createMany({
    data: [
      { kind: "RECEIVABLE", counterparty: "Landgericht Bremen", reference: "RE-2026-101", amount: 396000, issueDate: daysAgo(10), dueDate: inDays(18) },
      { kind: "RECEIVABLE", counterparty: "HUK-Coburg Vers. AG", reference: "RE-2026-103", amount: 154000, issueDate: daysAgo(20), dueDate: inDays(5) },
      { kind: "RECEIVABLE", counterparty: "Privatkunde Krüger", reference: "RE-2026-098", amount: 83300, issueDate: daysAgo(38), dueDate: daysAgo(3) }, // überfällig
      { kind: "PAYABLE", counterparty: "Kfz-Sachverständigen-Verband", reference: "MB-2026", amount: 42000, issueDate: daysAgo(6), dueDate: inDays(12) },
      { kind: "PAYABLE", counterparty: "Bürobedarf Wesermarsch", reference: "ER-5567", amount: 27850, issueDate: daysAgo(4), dueDate: inDays(9) },
    ],
  });

  // --- Szenarien ---
  await prisma.scenario.createMany({
    data: [
      { name: "Worst Case", inflowFactor: 0.85, outflowFactor: 1.1, inflowShiftDays: 14 },
      { name: "Best Case", inflowFactor: 1.1, outflowFactor: 0.97, inflowShiftDays: 0 },
    ],
  });

  await ensureBudgets();

  const txCount = await prisma.transaction.count();
  console.log(
    `Demo-Seed fertig: 2 Konten, ${catDefs.length} Kategorien, ${txCount} Umsätze, 6 Planposten, 5 offene Posten, 2 Szenarien.`,
  );
}

main()
  .catch((e) => {
    console.error("Demo-Seed Fehler:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
