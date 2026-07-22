import { prisma } from "./db";
import { INCLUDED_ACCOUNT } from "./queries";
import { todayUTC } from "./dates";

export interface RecurringSuggestion {
  counterparty: string;
  occurrences: number;
  medianAmount: number; // Cent, vorzeichenbehaftet
  avgGapDays: number;
  recurrence: "MONTHLY" | "WEEKLY" | "QUARTERLY" | "YEARLY";
  lastDate: string; // ISO
  categoryId: string | null;
  categoryName: string | null;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function classifyGap(days: number): RecurringSuggestion["recurrence"] | null {
  if (days >= 5 && days <= 9) return "WEEKLY";
  if (days >= 26 && days <= 35) return "MONTHLY";
  if (days >= 80 && days <= 100) return "QUARTERLY";
  if (days >= 350 && days <= 380) return "YEARLY";
  return null;
}

/**
 * Erkennt wiederkehrende Zahlungen: gleiche Gegenpartei, ≥3 Vorkommen, stabiler
 * Betrag und regelmäßiger Abstand. Blendet Posten aus, für die bereits ein
 * gleichnamiger Planposten existiert.
 */
export async function detectRecurring(minOccurrences = 3): Promise<RecurringSuggestion[]> {
  const since = new Date(todayUTC());
  since.setUTCFullYear(since.getUTCFullYear() - 1);

  const [txs, planned, cats] = await Promise.all([
    prisma.transaction.findMany({
      where: { bookingDate: { gte: since }, account: INCLUDED_ACCOUNT, counterparty: { not: "" } },
      select: { counterparty: true, amount: true, bookingDate: true, categoryId: true },
      orderBy: { bookingDate: "asc" },
    }),
    prisma.plannedItem.findMany({ select: { name: true } }),
    prisma.category.findMany({ select: { id: true, name: true } }),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const plannedNames = new Set(planned.map((p) => p.name.trim().toLowerCase()));

  type Group = { amounts: number[]; dates: Date[]; cats: Map<string, number>; raw: string };
  const groups = new Map<string, Group>();
  for (const t of txs) {
    const key = t.counterparty.trim().toLowerCase();
    if (!key) continue;
    const g: Group = groups.get(key) ?? { amounts: [], dates: [], cats: new Map<string, number>(), raw: t.counterparty };
    g.amounts.push(t.amount);
    g.dates.push(new Date(t.bookingDate));
    if (t.categoryId) g.cats.set(t.categoryId, (g.cats.get(t.categoryId) ?? 0) + 1);
    groups.set(key, g);
  }

  const out: RecurringSuggestion[] = [];
  for (const [key, g] of groups) {
    if (g.amounts.length < minOccurrences) continue;
    if (plannedNames.has(key)) continue;

    // Abstände zwischen aufeinanderfolgenden Buchungen.
    const gaps: number[] = [];
    for (let i = 1; i < g.dates.length; i++) {
      gaps.push((g.dates[i].getTime() - g.dates[i - 1].getTime()) / 86_400_000);
    }
    if (gaps.length === 0) continue;
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const rec = classifyGap(avgGap);
    if (!rec) continue;

    // Betragsstabilität: Median +/- 30%.
    const med = median(g.amounts);
    if (med === 0) continue;
    const stable = g.amounts.filter((a) => Math.abs(a - med) <= Math.abs(med) * 0.3).length;
    if (stable / g.amounts.length < 0.6) continue;

    let topCat: string | null = null;
    let max = 0;
    for (const [cid, n] of g.cats) if (n > max) ((max = n), (topCat = cid));

    out.push({
      counterparty: g.raw,
      occurrences: g.amounts.length,
      medianAmount: med,
      avgGapDays: Math.round(avgGap),
      recurrence: rec,
      lastDate: g.dates[g.dates.length - 1].toISOString().slice(0, 10),
      categoryId: topCat,
      categoryName: topCat ? catName.get(topCat) ?? null : null,
    });
  }
  return out.sort((a, b) => Math.abs(b.medianAmount) - Math.abs(a.medianAmount));
}
