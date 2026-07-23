import { PrismaClient, Prisma } from "@prisma/client";
import { singleTextValue, parseTree, textTree } from "../src/lib/rule-expr";

const prisma = new PrismaClient();

// Legt sinnvolle Standard-Kategorien und ein paar Auto-Regeln an.
// Idempotent: bei erneutem Lauf werden vorhandene Kategorien nicht dupliziert.
const CATEGORIES: { name: string; kind: "INCOME" | "EXPENSE"; color: string }[] = [
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

const RULES: { catName: string; field: "PURPOSE" | "COUNTERPARTY"; pattern: string }[] = [
  { catName: "Miete / Büro", field: "PURPOSE", pattern: "miete" },
  { catName: "Versicherungen", field: "PURPOSE", pattern: "versicherung" },
  { catName: "Kfz / Reisekosten", field: "PURPOSE", pattern: "tankstelle" },
  { catName: "Steuern / Abgaben", field: "COUNTERPARTY", pattern: "finanzamt" },
  { catName: "Software / IT", field: "COUNTERPARTY", pattern: "/microsoft|adobe|google/" },
];

async function main() {
  const byName = new Map<string, string>();
  for (const c of CATEGORIES) {
    const existing = await prisma.category.findFirst({ where: { name: c.name } });
    const cat = existing ?? (await prisma.category.create({ data: c }));
    byName.set(c.name, cat.id);
  }

  for (const r of RULES) {
    const categoryId = byName.get(r.catName);
    if (!categoryId) continue;
    const rules = await prisma.rule.findMany({ where: { categoryId }, select: { conditions: true } });
    const exists = rules.some((x) => {
      const t = singleTextValue(parseTree(JSON.stringify(x.conditions)));
      return t?.field === r.field && t.value === r.pattern;
    });
    if (!exists) {
      await prisma.rule.create({
        data: { categoryId, conditions: textTree(r.field, "CONTAINS", r.pattern) as unknown as Prisma.InputJsonValue },
      });
    }
  }

  console.log(`Seed fertig: ${CATEGORIES.length} Kategorien, ${RULES.length} Regeln.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
