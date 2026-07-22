import { prisma } from "./db";
import { INCLUDED_ACCOUNT } from "./queries";
import { todayUTC } from "./dates";

export interface DebtorShare {
  name: string;
  revenue: number; // Erlöse im Zeitraum (Cent)
  share: number; // Anteil 0..1
  openReceivable: number; // aktuell offene Forderung (Cent)
}

export interface ConcentrationReport {
  months: number;
  totalRevenue: number;
  debtors: DebtorShare[];
  hhi: number; // Herfindahl-Hirschman-Index (0..10000)
  top1Share: number;
  top3Share: number;
}

/**
 * Klumpenrisiko: Erlöskonzentration nach Auftraggeber über die letzten n Monate
 * plus aktuell offene Forderungen je Auftraggeber. HHI als Konzentrationsmaß.
 */
export async function getConcentration(months = 12, topN = 15): Promise<ConcentrationReport> {
  const since = new Date(todayUTC());
  since.setUTCMonth(since.getUTCMonth() - months);

  const cats = await prisma.category.findMany({ where: { kind: "INCOME", deletedAt: null }, select: { id: true } });
  const incomeIds = new Set(cats.map((c) => c.id));

  const [txs, openItems] = await Promise.all([
    prisma.transaction.findMany({
      where: { bookingDate: { gte: since }, account: INCLUDED_ACCOUNT, amount: { gt: 0 } },
      select: { counterparty: true, amount: true, categoryId: true },
    }),
    prisma.openItem.findMany({
      where: { kind: "RECEIVABLE", paid: false },
      select: { counterparty: true, amount: true, paidAmount: true },
    }),
  ]);

  const rev = new Map<string, number>();
  for (const t of txs) {
    // Erlöse: positive Umsätze in einer INCOME-Kategorie (oder unkategorisiert positiv).
    if (t.categoryId && !incomeIds.has(t.categoryId)) continue;
    const key = t.counterparty.trim() || "(unbekannt)";
    rev.set(key, (rev.get(key) ?? 0) + t.amount);
  }
  const open = new Map<string, number>();
  for (const i of openItems) {
    const key = i.counterparty.trim() || "(unbekannt)";
    open.set(key, (open.get(key) ?? 0) + Math.max(0, i.amount - i.paidAmount));
  }

  const totalRevenue = [...rev.values()].reduce((a, b) => a + b, 0);
  const all = [...rev.entries()].map(([name, revenue]) => ({
    name,
    revenue,
    share: totalRevenue > 0 ? revenue / totalRevenue : 0,
    openReceivable: open.get(name) ?? 0,
  }));
  all.sort((a, b) => b.revenue - a.revenue);

  const hhi = Math.round(all.reduce((s, d) => s + Math.pow(d.share * 100, 2), 0));
  const top1Share = all[0]?.share ?? 0;
  const top3Share = all.slice(0, 3).reduce((s, d) => s + d.share, 0);

  return { months, totalRevenue, debtors: all.slice(0, topN), hhi, top1Share, top3Share };
}
