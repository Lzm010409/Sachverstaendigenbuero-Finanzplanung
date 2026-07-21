// Datums-Helfer, die konsequent mit UTC-Mitternacht arbeiten, damit
// Zeitzonen nicht in die Tages-Buckets der Vorschau hineinpfuschen.

export function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function todayUTC(): Date {
  return startOfDayUTC(new Date());
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  const targetMonth = r.getUTCMonth() + months;
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(targetMonth);
  // Monatsende korrekt behandeln (z.B. 31. -> 28./30.)
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}

export function isoDate(d: Date): string {
  return startOfDayUTC(d).toISOString().slice(0, 10);
}

export function sameOrBefore(a: Date, b: Date): boolean {
  return startOfDayUTC(a).getTime() <= startOfDayUTC(b).getTime();
}
