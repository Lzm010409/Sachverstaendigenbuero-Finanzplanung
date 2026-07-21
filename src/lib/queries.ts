import { prisma } from "./db";
import { buildForecast, type ForecastResult } from "./forecast";
import { todayUTC } from "./dates";

/**
 * Aktueller Gesamtsaldo (Cent) = Summe der Anfangssalden aller aktiven Konten
 * plus Summe aller gebuchten Umsätze.
 * Konvention: Anfangssaldo = Kontostand zum openingDate; danach werden alle
 * importierten Umsätze aufaddiert.
 */
export async function getTotalBalanceCents(): Promise<number> {
  const [accounts, txAgg] = await Promise.all([
    prisma.account.aggregate({
      _sum: { openingBalance: true },
      where: { archived: false },
    }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { account: { archived: false } },
    }),
  ]);
  return (accounts._sum.openingBalance ?? 0) + (txAgg._sum.amount ?? 0);
}

export interface AccountWithBalance {
  id: string;
  name: string;
  type: string;
  iban: string | null;
  openingBalance: number;
  currentBalance: number;
  txCount: number;
}

export async function getAccountsWithBalance(): Promise<AccountWithBalance[]> {
  const accounts = await prisma.account.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { transactions: true } },
      transactions: { select: { amount: true } },
    },
  });
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    iban: a.iban,
    openingBalance: a.openingBalance,
    currentBalance: a.openingBalance + a.transactions.reduce((s, t) => s + t.amount, 0),
    txCount: a._count.transactions,
  }));
}

/** Baut die Liquiditätsvorschau über einen Horizont (Tage) aus den DB-Daten. */
export async function getForecast(horizonDays = 90): Promise<ForecastResult> {
  const [startBalance, planned] = await Promise.all([
    getTotalBalanceCents(),
    prisma.plannedItem.findMany({ where: { active: true } }),
  ]);

  return buildForecast({
    startBalanceCents: startBalance,
    today: todayUTC(),
    horizonDays,
    plannedItems: planned.map((p) => ({
      id: p.id,
      name: p.name,
      amount: p.amount,
      recurrence: p.recurrence,
      interval: p.interval,
      startDate: p.startDate,
      endDate: p.endDate,
    })),
  });
}
