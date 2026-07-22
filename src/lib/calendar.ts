import { prisma } from "./db";
import { occurrencesBetween } from "./recurrence";
import { addDays, isoDate, todayUTC } from "./dates";

export interface CalendarEvent {
  date: string; // ISO
  label: string;
  amount: number; // Cent, vorzeichenbehaftet
  type: "receivable" | "payable" | "planned";
  reference?: string | null;
}

export interface CalendarDay {
  date: string;
  weekday: string;
  events: CalendarEvent[];
  inflow: number;
  outflow: number;
  net: number;
}

const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Fälligkeits-Agenda für die nächsten `days` Tage (offene Posten + Planposten). */
export async function getPaymentCalendar(days = 56): Promise<{ days: CalendarDay[]; totalIn: number; totalOut: number }> {
  const today = todayUTC();
  const end = addDays(today, days);

  const [openItems, planned] = await Promise.all([
    prisma.openItem.findMany({ where: { paid: false }, select: { kind: true, amount: true, paidAmount: true, dueDate: true, counterparty: true, reference: true } }),
    prisma.plannedItem.findMany({ where: { active: true } }),
  ]);

  const byDate = new Map<string, CalendarEvent[]>();
  const push = (e: CalendarEvent) => {
    const arr = byDate.get(e.date) ?? [];
    arr.push(e);
    byDate.set(e.date, arr);
  };

  for (const i of openItems) {
    const open = Math.max(0, i.amount - i.paidAmount);
    if (open <= 0) continue;
    // Überfällige auf heute ziehen (wie im Forecast).
    let d = new Date(i.dueDate);
    if (d.getTime() < today.getTime()) d = today;
    if (d.getTime() > end.getTime()) continue;
    push({
      date: isoDate(d),
      label: i.counterparty || (i.kind === "RECEIVABLE" ? "Forderung" : "Verbindlichkeit"),
      amount: i.kind === "RECEIVABLE" ? open : -open,
      type: i.kind === "RECEIVABLE" ? "receivable" : "payable",
      reference: i.reference,
    });
  }

  for (const p of planned) {
    for (const occ of occurrencesBetween(p, today, end)) {
      push({ date: isoDate(occ), label: p.name, amount: p.amount, type: "planned" });
    }
  }

  const daysOut: CalendarDay[] = [];
  let totalIn = 0;
  let totalOut = 0;
  for (let i = 0; i <= days; i++) {
    const d = addDays(today, i);
    const key = isoDate(d);
    const events = (byDate.get(key) ?? []).sort((a, b) => a.amount - b.amount);
    if (events.length === 0) continue;
    const inflow = events.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
    const outflow = events.filter((e) => e.amount < 0).reduce((s, e) => s + -e.amount, 0);
    totalIn += inflow;
    totalOut += outflow;
    daysOut.push({ date: key, weekday: WD[d.getUTCDay()], events, inflow, outflow, net: inflow - outflow });
  }
  return { days: daysOut, totalIn, totalOut };
}
