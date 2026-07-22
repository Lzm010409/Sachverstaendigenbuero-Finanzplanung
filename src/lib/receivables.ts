import { prisma } from "./db";
import { todayUTC } from "./dates";

export interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  count: number;
  amount: number; // offener Restbetrag (Cent)
}

export interface ReceivablesReport {
  buckets: AgingBucket[];
  totalOpen: number;
  overdueOpen: number;
  count: number;
  dsoDays: number | null; // durchschnittliche Zahlungsdauer (Days Sales Outstanding)
}

const openOf = (i: { amount: number; paidAmount: number }) => Math.max(0, i.amount - i.paidAmount);

/**
 * Alterstruktur der offenen Forderungen + DSO.
 * DSO wird aus bezahlten Forderungen geschätzt (Ausstellung -> Zahldatum).
 */
export async function getReceivablesReport(): Promise<ReceivablesReport> {
  const today = todayUTC();
  const [openItems, paid] = await Promise.all([
    prisma.openItem.findMany({
      where: { kind: "RECEIVABLE", paid: false },
      select: { amount: true, paidAmount: true, dueDate: true },
    }),
    prisma.openItem.findMany({
      where: { kind: "RECEIVABLE", paid: true, paidDate: { not: null }, issueDate: { not: null } },
      select: { issueDate: true, paidDate: true },
      take: 500,
      orderBy: { paidDate: "desc" },
    }),
  ]);

  const defs: { label: string; min: number; max: number | null }[] = [
    { label: "nicht fällig", min: -100000, max: 0 },
    { label: "1–30 Tage", min: 1, max: 30 },
    { label: "31–60 Tage", min: 31, max: 60 },
    { label: "61–90 Tage", min: 61, max: 90 },
    { label: "> 90 Tage", min: 91, max: null },
  ];
  const buckets: AgingBucket[] = defs.map((d) => ({ label: d.label, minDays: d.min, maxDays: d.max, count: 0, amount: 0 }));

  let totalOpen = 0;
  let overdueOpen = 0;
  for (const i of openItems) {
    const open = openOf(i);
    if (open <= 0) continue;
    totalOpen += open;
    const daysOverdue = Math.floor((today.getTime() - new Date(i.dueDate).getTime()) / 86_400_000);
    if (daysOverdue > 0) overdueOpen += open;
    const b = buckets.find((x) => daysOverdue >= x.minDays && (x.maxDays == null || daysOverdue <= x.maxDays));
    if (b) {
      b.count++;
      b.amount += open;
    }
  }

  let dsoDays: number | null = null;
  if (paid.length > 0) {
    const sum = paid.reduce((s, p) => {
      const d = Math.max(0, (new Date(p.paidDate!).getTime() - new Date(p.issueDate!).getTime()) / 86_400_000);
      return s + d;
    }, 0);
    dsoDays = Math.round(sum / paid.length);
  }

  return { buckets, totalOpen, overdueOpen, count: openItems.length, dsoDays };
}

export const REMINDER_LABELS = ["keine", "Zahlungserinnerung", "1. Mahnung", "2. Mahnung / Inkasso"] as const;

/** Empfohlene Mahnstufe anhand der Überfälligkeitstage. */
export function suggestedReminderLevel(daysOverdue: number): number {
  if (daysOverdue <= 0) return 0;
  if (daysOverdue <= 14) return 1;
  if (daysOverdue <= 30) return 2;
  return 3;
}
