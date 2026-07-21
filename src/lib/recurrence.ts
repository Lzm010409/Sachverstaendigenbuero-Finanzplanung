import { addDays, addMonths, sameOrBefore, startOfDayUTC } from "./dates";

export type Recurrence = "ONCE" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface RecurringInput {
  recurrence: Recurrence;
  interval: number; // >= 1
  startDate: Date;
  endDate?: Date | null;
}

/**
 * Liefert alle Fälligkeitstermine einer Planbuchung im Zeitfenster [from, to]
 * (jeweils inklusive). Rechnet vom startDate aus in festen Schritten weiter.
 */
export function occurrencesBetween(item: RecurringInput, from: Date, to: Date): Date[] {
  const result: Date[] = [];
  const start = startOfDayUTC(item.startDate);
  const windowFrom = startOfDayUTC(from);
  const windowTo = startOfDayUTC(to);
  const end = item.endDate ? startOfDayUTC(item.endDate) : null;
  const step = Math.max(1, Math.floor(item.interval || 1));

  if (item.recurrence === "ONCE") {
    if (
      sameOrBefore(windowFrom, start) &&
      sameOrBefore(start, windowTo) &&
      (!end || sameOrBefore(start, end))
    ) {
      result.push(start);
    }
    return result;
  }

  const advance = (d: Date, count: number): Date => {
    switch (item.recurrence) {
      case "WEEKLY":
        return addDays(d, 7 * step * count);
      case "MONTHLY":
        return addMonths(d, step * count);
      case "QUARTERLY":
        return addMonths(d, 3 * step * count);
      case "YEARLY":
        return addMonths(d, 12 * step * count);
      default:
        return d;
    }
  };

  // Sicherheitslimit gegen Endlosschleifen
  const MAX = 10_000;
  for (let i = 0; i < MAX; i++) {
    const occ = advance(start, i);
    if (occ.getTime() > windowTo.getTime()) break;
    if (end && occ.getTime() > end.getTime()) break;
    if (occ.getTime() >= windowFrom.getTime()) result.push(occ);
  }
  return result;
}
