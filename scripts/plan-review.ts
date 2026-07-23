// Gleicht die Plandaten (Budgets + Planposten) mit den TATSÄCHLICHEN Umsätzen
// der letzten 3 vollen Monate ab (nur einbezogene Konten, ohne Geldtransfers) und
// gibt je Kategorie Ø-Ist/Monat, aktuellen Plan/Monat, Differenz und einen
// Vorschlag aus. READ-ONLY – ändert nichts. Läuft im Container per
// PLAN_REVIEW=true (Ausgabe über die Coolify-Logs).

import { prisma } from "@/lib/db";
import { budgetAnnualCents, type BudgetPeriod } from "@/lib/budget";
import { occurrencesBetween } from "@/lib/recurrence";

const eur = (c: number) => (c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (s: string, n: number) => s.padStart(n);

async function main() {
  // Referenz: letzter voller Monat = Vormonat des Monats der letzten Buchung.
  const latest = await prisma.transaction.findFirst({ orderBy: { bookingDate: "desc" }, select: { bookingDate: true } });
  const ref = latest?.bookingDate ?? new Date();
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth(); // 0-basiert; Monat der letzten Buchung
  // 3 volle Monate VOR dem laufenden (Monat der letzten Buchung gilt als evtl. unvollständig).
  const months: { start: Date; end: Date; label: string }[] = [];
  for (let i = 3; i >= 1; i--) {
    const start = new Date(Date.UTC(y, m - i, 1));
    const end = new Date(Date.UTC(y, m - i + 1, 1));
    months.push({ start, end, label: start.toLocaleDateString("de-DE", { month: "short", year: "2-digit" }) });
  }
  const windowStart = months[0].start;
  const windowEnd = months[months.length - 1].end;
  const lastOfWindow = new Date(windowEnd.getTime() - 86_400_000);

  console.log(`\n=== Plan/Ist-Abgleich: ${months.map((mm) => mm.label).join(" · ")} (3 volle Monate) ===`);

  // Kategorien (ohne Transfer, nicht gelöscht).
  const cats = await prisma.category.findMany({
    where: { deletedAt: null, isTransfer: false },
    select: { id: true, name: true, kind: true },
  });
  const catById = new Map(cats.map((c) => [c.id, c]));

  // Ist je Kategorie und Monat (nur einbezogene Konten).
  const txs = await prisma.transaction.findMany({
    where: {
      bookingDate: { gte: windowStart, lt: windowEnd },
      account: { archived: false, excludedFromCalc: false },
      category: { isTransfer: false, deletedAt: null },
    },
    select: { amount: true, bookingDate: true, categoryId: true },
  });
  // key -> [m1,m2,m3] Magnitude
  const actual = new Map<string, number[]>();
  for (const t of txs) {
    if (!t.categoryId) continue;
    const idx = months.findIndex((mm) => t.bookingDate >= mm.start && t.bookingDate < mm.end);
    if (idx < 0) continue;
    const arr = actual.get(t.categoryId) ?? [0, 0, 0];
    arr[idx] += Math.abs(t.amount);
    actual.set(t.categoryId, arr);
  }

  // Budgets je Kategorie -> Monatsbetrag.
  const budgets = await prisma.budget.findMany({
    where: { deletedAt: null, active: true, categoryId: { not: null } },
    select: { categoryId: true, amount: true, period: true },
  });
  const budgetMonthly = new Map<string, number>();
  for (const b of budgets) {
    const monthly = Math.round(budgetAnnualCents(b.amount, b.period as BudgetPeriod) / 12);
    budgetMonthly.set(b.categoryId!, (budgetMonthly.get(b.categoryId!) ?? 0) + monthly);
  }

  // Planposten je Kategorie -> Ø Monatsbetrag über das Fenster.
  const planned = await prisma.plannedItem.findMany({
    where: { active: true, categoryId: { not: null } },
    select: { categoryId: true, amount: true, recurrence: true, interval: true, startDate: true, endDate: true },
  });
  const plannedMonthly = new Map<string, number>();
  for (const p of planned) {
    const occ = occurrencesBetween(p, windowStart, lastOfWindow);
    if (occ.length === 0) continue;
    const perMonth = Math.round((Math.abs(p.amount) * occ.length) / 3);
    plannedMonthly.set(p.categoryId!, (plannedMonthly.get(p.categoryId!) ?? 0) + perMonth);
  }

  // Alle relevanten Kategorien (mit Ist ODER Plan).
  const keys = new Set<string>([...actual.keys(), ...budgetMonthly.keys(), ...plannedMonthly.keys()]);

  type Row = {
    name: string; kind: string; months: number[]; avg: number; plan: number; budget: number; plannedM: number;
    diff: number; monthsWithActual: number; suggestion: string;
  };
  const rows: Row[] = [];
  for (const id of keys) {
    const c = catById.get(id);
    if (!c) continue; // (ohne Kategorie) / Transfer ignorieren
    const mm = actual.get(id) ?? [0, 0, 0];
    const total = mm[0] + mm[1] + mm[2];
    const avg = Math.round(total / 3);
    const budget = budgetMonthly.get(id) ?? 0;
    const plannedM = plannedMonthly.get(id) ?? 0;
    const plan = budget + plannedM;
    const diff = avg - plan;
    const monthsWithActual = mm.filter((v) => v > 0).length;

    // Vorschlagslogik (konservativ, nur Hinweise – wird NICHT automatisch angewandt).
    let suggestion = "ok";
    const regular = monthsWithActual >= 2; // in ≥2 der 3 Monate aufgetreten
    if (plan === 0 && total > 0) {
      suggestion = regular
        ? `NEU: Budget ~${eur(avg)} €/Monat (regelmäßig)`
        : `PRÜFEN: unregelmäßig, evtl. einmalig (${eur(total)} € gesamt)`;
    } else if (plan > 0 && total === 0) {
      suggestion = "PRÜFEN: Plan vorhanden, aber kein Ist im Zeitraum";
    } else if (plan > 0) {
      const rel = plan > 0 ? Math.abs(diff) / plan : 0;
      if (Math.abs(diff) >= 5000 && rel >= 0.25) {
        suggestion = `ANPASSEN: Plan ${eur(plan)} → ~${eur(avg)} €/Monat (${diff > 0 ? "+" : ""}${eur(diff)})`;
      }
    }
    rows.push({ name: c.name, kind: c.kind, months: mm, avg, plan, budget, plannedM, diff, monthsWithActual, suggestion });
  }

  const fmtRow = (r: Row) => {
    const detail = `[${r.months.map((v) => eur(v)).join(" | ")}]`;
    return (
      `  ${pad(eur(r.avg), 11)} €/M Ist  ` +
      `Plan ${pad(eur(r.plan), 10)} € (B:${eur(r.budget)}/P:${eur(r.plannedM)})  ` +
      `${pad((r.diff > 0 ? "+" : "") + eur(r.diff), 11)}  ` +
      `${r.name}\n       ${detail}  →  ${r.suggestion}`
    );
  };

  for (const kind of ["EXPENSE", "INCOME"] as const) {
    const sub = rows.filter((r) => r.kind === kind).sort((a, b) => b.avg - a.avg);
    console.log(`\n----- ${kind === "EXPENSE" ? "AUSGABEN" : "EINNAHMEN"} (Ø/Monat, absteigend) -----`);
    console.log(`  (Werte je Monat in [ ${months.map((mm) => mm.label).join(" | ")} ])`);
    for (const r of sub) console.log(fmtRow(r));
  }

  // Fokus: nur die Handlungsempfehlungen.
  const actionable = rows.filter((r) => r.suggestion !== "ok").sort((a, b) => b.avg - a.avg);
  console.log(`\n===== VORSCHLÄGE (${actionable.length}) =====`);
  for (const r of actionable) console.log(`  [${r.kind}] ${r.name}: ${r.suggestion}`);
  console.log("\n=== Ende ===\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
