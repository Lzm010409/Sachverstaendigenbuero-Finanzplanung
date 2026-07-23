// Anomalie-Engine: erkennt auffällige Zustände in den Daten und liefert je
// Meldung eine Stufe (info/warn/error), die betroffene Seite, Titel/Detail und
// optional einen Link. Wird sowohl seitenspezifisch (Banner) als auch gesamt
// (Benachrichtigungen + E-Mail-Digest) genutzt.

import { prisma } from "./db";
import { INCLUDED_ACCOUNT, getAccountsWithBalance, getForecast, getTotalBalanceCents } from "./queries";
import { getReceivablesReport } from "./receivables";
import { getConcentration } from "./concentration";
import { getVatForecast } from "./tax";
import { getCategoryBreakdown, getKpis } from "./analytics";
import { getPlanningSettings, findThresholdBreach } from "./planning";
import { todayUTC } from "./dates";
import { formatCents } from "./money";

export type AnomalyLevel = "info" | "warn" | "error";

export interface Anomaly {
  level: AnomalyLevel;
  page: string; // Route, zu der die Meldung gehört
  key: string; // stabil, für Dedup
  title: string;
  detail: string;
  href?: string;
}

const RANK: Record<AnomalyLevel, number> = { info: 0, warn: 1, error: 2 };

// --- einzelne Detektoren ---------------------------------------------------

async function forecastAnomalies(): Promise<Anomaly[]> {
  const out: Anomaly[] = [];
  const [forecast, planning] = await Promise.all([getForecast(180), getPlanningSettings()]);
  if (forecast.lowest.balance < 0) {
    out.push({
      level: "error", page: "/forecast", key: "forecast.negative",
      title: "Negative Liquidität prognostiziert",
      detail: `Tiefpunkt am ${new Date(forecast.lowest.date).toLocaleDateString("de-DE")}: ${formatCents(forecast.lowest.balance)}.`,
      href: "/forecast",
    });
  }
  const breach = findThresholdBreach(forecast, planning.minLiquidityCents);
  if (planning.minLiquidityCents > 0 && breach && forecast.lowest.balance >= 0) {
    out.push({
      level: breach.daysAway <= 14 ? "error" : "warn", page: "/forecast", key: "forecast.threshold",
      title: "Mindestliquidität unterschritten",
      detail: `Am ${new Date(breach.date).toLocaleDateString("de-DE")} (${breach.daysAway} T) fällt die Prognose auf ${formatCents(breach.balance)}.`,
      href: "/forecast",
    });
  }
  const kpis = await getKpis();
  if (kpis.runwayMonths != null && kpis.runwayMonths < 6) {
    out.push({
      level: kpis.runwayMonths < 3 ? "error" : "warn", page: "/", key: "forecast.runway",
      title: "Kurze Reichweite",
      detail: `Bei aktuellem Netto-Verbrauch reicht die Liquidität noch ${kpis.runwayMonths} Monate.`,
      href: "/forecast",
    });
  }
  return out;
}

async function receivableAnomalies(): Promise<Anomaly[]> {
  const out: Anomaly[] = [];
  const [report, worst] = await Promise.all([
    getReceivablesReport(),
    prisma.openItem.findFirst({
      where: { kind: "RECEIVABLE", paid: false, dueDate: { lt: todayUTC() } },
      orderBy: { amount: "desc" },
      select: { counterparty: true, amount: true, paidAmount: true, dueDate: true, reference: true },
    }),
  ]);
  const over90 = report.buckets.find((b) => b.minDays >= 91);
  if (over90 && over90.amount > 0) {
    out.push({
      level: "error", page: "/receivables", key: "recv.over90",
      title: "Forderungen über 90 Tage überfällig",
      detail: `${formatCents(over90.amount)} in ${over90.count} Posten sind seit über 90 Tagen offen.`,
      href: "/receivables",
    });
  }
  if (report.overdueOpen > 0) {
    out.push({
      level: report.overdueOpen > 2000000 ? "warn" : "info", page: "/receivables", key: "recv.overdue",
      title: "Überfällige Forderungen",
      detail: `${formatCents(report.overdueOpen)} offen und überfällig${report.dsoDays != null ? ` · Ø Zahlungsdauer ${report.dsoDays} Tage` : ""}.`,
      href: "/receivables",
    });
  }
  if (report.dsoDays != null && report.dsoDays > 45) {
    out.push({
      level: "warn", page: "/receivables", key: "recv.dso",
      title: "Hohe durchschnittliche Zahlungsdauer",
      detail: `DSO liegt bei ${report.dsoDays} Tagen — Zahlungseingänge dauern länger als üblich.`,
      href: "/receivables",
    });
  }
  if (worst) {
    const open = worst.amount - worst.paidAmount;
    if (open > 300000) {
      out.push({
        level: "warn", page: "/receivables", key: "recv.singleLarge",
        title: "Große überfällige Einzelforderung",
        detail: `${worst.counterparty || "Forderung"} (${worst.reference ?? "—"}): ${formatCents(open)} offen, fällig war ${new Date(worst.dueDate).toLocaleDateString("de-DE")}.`,
        href: "/receivables",
      });
    }
  }
  return out;
}

async function transactionAnomalies(): Promise<Anomaly[]> {
  const out: Anomaly[] = [];
  const today = todayUTC();
  const from = new Date(today); from.setUTCMonth(from.getUTCMonth() - 3);

  const [total, uncategorized, zero, future, recent] = await Promise.all([
    prisma.transaction.count({ where: { account: INCLUDED_ACCOUNT } }),
    prisma.transaction.count({ where: { account: INCLUDED_ACCOUNT, categoryId: null } }),
    prisma.transaction.count({ where: { account: INCLUDED_ACCOUNT, amount: 0 } }),
    prisma.transaction.count({ where: { account: INCLUDED_ACCOUNT, bookingDate: { gt: today } } }),
    prisma.transaction.findMany({
      where: { account: INCLUDED_ACCOUNT, bookingDate: { gte: from } },
      select: { amount: true, counterparty: true, bookingDate: true },
    }),
  ]);

  if (total > 0 && uncategorized / total > 0.2) {
    out.push({
      level: "warn", page: "/transactions", key: "tx.uncategorized",
      title: "Viele nicht kategorisierte Umsätze",
      detail: `${uncategorized} von ${total} Umsätzen (${Math.round((uncategorized / total) * 100)} %) ohne Kategorie — Auswertung & Steuer-Vorschau werden ungenau.`,
      href: "/categories",
    });
  }
  if (zero > 0) {
    out.push({
      level: "info", page: "/transactions", key: "tx.zero",
      title: "Umsätze mit Betrag 0",
      detail: `${zero} Umsätze haben Betrag 0,00 € — evtl. fehlerhafte Importe.`,
      href: "/transactions?q=",
    });
  }
  if (future > 0) {
    out.push({
      level: "warn", page: "/transactions", key: "tx.future",
      title: "Zukünftig datierte Buchungen",
      detail: `${future} Umsätze liegen nach heute — Salden könnten verfälscht sein.`,
      href: "/transactions",
    });
  }

  // Ausreißer: |Betrag| > Mittel + 4·Standardabweichung (letzte 3 Monate).
  if (recent.length > 20) {
    const amts = recent.map((t) => Math.abs(t.amount));
    const mean = amts.reduce((a, b) => a + b, 0) / amts.length;
    const variance = amts.reduce((s, a) => s + (a - mean) ** 2, 0) / amts.length;
    const sd = Math.sqrt(variance);
    const outliers = recent.filter((t) => Math.abs(t.amount) > mean + 4 * sd);
    if (outliers.length > 0) {
      const top = outliers.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
      out.push({
        level: "info", page: "/transactions", key: "tx.outlier",
        title: "Ungewöhnlich große Buchung",
        detail: `${outliers.length} Ausreißer in 3 Monaten, größte: ${formatCents(top.amount)} (${top.counterparty || "—"}, ${new Date(top.bookingDate).toLocaleDateString("de-DE")}).`,
        href: "/transactions",
      });
    }

    // Mögliche Doppelbuchungen: gleiche Gegenpartei, gleicher Betrag, gleicher Tag.
    const seen = new Map<string, number>();
    for (const t of recent) {
      const k = `${t.counterparty}|${t.amount}|${new Date(t.bookingDate).toISOString().slice(0, 10)}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    const dups = [...seen.values()].filter((n) => n > 1).length;
    if (dups > 0) {
      out.push({
        level: "warn", page: "/transactions", key: "tx.dup",
        title: "Mögliche Doppelbuchungen",
        detail: `${dups} Gruppen mit identischer Gegenpartei, Betrag und Datum in den letzten 3 Monaten.`,
        href: "/transactions",
      });
    }
  }
  return out;
}

async function accountAnomalies(): Promise<Anomaly[]> {
  const out: Anomaly[] = [];
  const accts = await getAccountsWithBalance();
  for (const a of accts) {
    if (a.excludedFromCalc) continue;
    if (a.currentBalance < 0) {
      out.push({
        level: "warn", page: "/accounts", key: `acc.negative.${a.id}`,
        title: "Negativer Kontostand",
        detail: `${a.name}: ${formatCents(a.currentBalance)}.`,
        href: "/accounts",
      });
    }
    if (a.txCount === 0) {
      out.push({
        level: "info", page: "/accounts", key: `acc.empty.${a.id}`,
        title: "Konto ohne Umsätze",
        detail: `${a.name} hat keine Umsätze — Anfangssaldo/Stichtag prüfen.`,
        href: "/accounts",
      });
    }
  }
  return out;
}

async function taxAnomalies(): Promise<Anomaly[]> {
  const out: Anomaly[] = [];
  const today = todayUTC();
  const [vat, balance] = await Promise.all([getVatForecast(0, 2), getTotalBalanceCents()]);
  const nextDue = vat.periods.find((p) => p.dueDate >= today && p.vatPayable > 0);
  if (nextDue) {
    const soon = (nextDue.dueDate.getTime() - today.getTime()) / 86400000 <= 21;
    const big = nextDue.vatPayable > balance * 0.5;
    if (soon || big) {
      out.push({
        level: big ? "warn" : "info", page: "/tax", key: "tax.due",
        title: "USt-Zahllast steht an",
        detail: `${formatCents(nextDue.vatPayable)} fällig zum ${nextDue.dueDate.toLocaleDateString("de-DE")} (${nextDue.label})${big ? " — über 50 % der aktuellen Liquidität" : ""}.`,
        href: "/tax",
      });
    }
  }
  return out;
}

async function concentrationAnomalies(): Promise<Anomaly[]> {
  const out: Anomaly[] = [];
  const c = await getConcentration(12);
  if (c.top1Share > 0.3 && c.debtors[0]) {
    out.push({
      level: c.top1Share > 0.5 ? "warn" : "info", page: "/concentration", key: "conc.top1",
      title: "Hohe Auftraggeber-Abhängigkeit",
      detail: `${c.debtors[0].name} macht ${(c.top1Share * 100).toFixed(0)} % der Erlöse (12 Monate) aus.`,
      href: "/concentration",
    });
  }
  return out;
}

async function budgetAnomalies(): Promise<Anomaly[]> {
  const out: Anomaly[] = [];
  const b = await getCategoryBreakdown("month");
  const over = [...b.incomeRows, ...b.expenseRows].filter((r) => r.budgetPct != null && r.budgetPct > 1);
  if (over.length > 0) {
    const worst = over.sort((a, b2) => (b2.budgetPct ?? 0) - (a.budgetPct ?? 0))[0];
    out.push({
      level: "warn", page: "/breakdown", key: "budget.over",
      title: "Jahresbudget überschritten",
      detail: `${over.length} Kategorie(n) über Budget, am stärksten „${worst.name}" (${Math.round((worst.budgetPct ?? 0) * 100)} %).`,
      href: "/breakdown",
    });
  }
  return out;
}

// --- Registry --------------------------------------------------------------

const ALL_DETECTORS = [
  forecastAnomalies, receivableAnomalies, transactionAnomalies,
  accountAnomalies, taxAnomalies, concentrationAnomalies, budgetAnomalies,
];

const PAGE_DETECTORS: Record<string, (() => Promise<Anomaly[]>)[]> = {
  "/": [forecastAnomalies, receivableAnomalies, taxAnomalies],
  "/forecast": [forecastAnomalies],
  "/receivables": [receivableAnomalies],
  "/open-items": [receivableAnomalies],
  "/transactions": [transactionAnomalies],
  "/accounts": [accountAnomalies],
  "/tax": [taxAnomalies],
  "/concentration": [concentrationAnomalies],
  "/breakdown": [budgetAnomalies],
  "/categories": [transactionAnomalies],
};

function dedupeSort(items: Anomaly[]): Anomaly[] {
  const byKey = new Map<string, Anomaly>();
  for (const a of items) if (!byKey.has(a.key)) byKey.set(a.key, a);
  // Jede Meldung verlinkt auf ihren Objekt-Drilldown (betroffene Datensätze).
  return [...byKey.values()]
    .map((a) => ({ ...a, href: `/drilldown?metric=anomaly&key=${encodeURIComponent(a.key)}` }))
    .sort((a, b) => RANK[b.level] - RANK[a.level]);
}

// --- Drilldown: betroffene Objekte je Anomalie ----------------------------

export interface AnomalyDetailRow {
  label: string;
  sub?: string;
  date?: string;
  amount?: number;
  badge?: string;
}
export interface AnomalyDetail {
  title: string;
  note?: string;
  rows: AnomalyDetailRow[];
  pageHref?: string;
  pageLabel?: string;
}

const LIMIT = 200;

/** Liefert die konkreten Datensätze hinter einer Anomalie (für den Drilldown). */
export async function getAnomalyDetail(key: string): Promise<AnomalyDetail> {
  const today = todayUTC();
  const base = key.split(".").slice(0, 2).join(".");
  const openOf = (i: { amount: number; paidAmount: number }) => Math.max(0, i.amount - i.paidAmount);

  const txRows = (ts: { counterparty: string; purpose: string; amount: number; bookingDate: Date; category?: { name: string } | null; account?: { name: string } | null }[]): AnomalyDetailRow[] =>
    ts.map((t) => ({
      label: t.counterparty || t.purpose || "Umsatz",
      sub: [t.category?.name, t.account?.name].filter(Boolean).join(" · ") || t.purpose || undefined,
      date: t.bookingDate.toISOString().slice(0, 10),
      amount: t.amount,
    }));

  if (base === "tx.uncategorized") {
    const ts = await prisma.transaction.findMany({ where: { account: INCLUDED_ACCOUNT, categoryId: null }, orderBy: [{ bookingDate: "desc" }, { id: "desc" }], take: LIMIT, include: { account: true } });
    return { title: "Nicht kategorisierte Umsätze", rows: txRows(ts), pageHref: "/transactions?state=uncategorized", pageLabel: "In Umsätzen filtern" };
  }
  if (base === "tx.zero") {
    const ts = await prisma.transaction.findMany({ where: { account: INCLUDED_ACCOUNT, amount: 0 }, orderBy: [{ bookingDate: "desc" }, { id: "desc" }], take: LIMIT, include: { account: true } });
    return { title: "Umsätze mit Betrag 0", rows: txRows(ts) };
  }
  if (base === "tx.future") {
    const ts = await prisma.transaction.findMany({ where: { account: INCLUDED_ACCOUNT, bookingDate: { gt: today } }, orderBy: { bookingDate: "asc" }, take: LIMIT, include: { account: true } });
    return { title: "Zukünftig datierte Buchungen", rows: txRows(ts) };
  }
  if (base === "tx.outlier" || base === "tx.dup") {
    const from = new Date(today); from.setUTCMonth(from.getUTCMonth() - 3);
    const recent = await prisma.transaction.findMany({ where: { account: INCLUDED_ACCOUNT, bookingDate: { gte: from } }, include: { account: true, category: true } });
    if (base === "tx.outlier") {
      const amts = recent.map((t) => Math.abs(t.amount));
      const mean = amts.reduce((a, b) => a + b, 0) / (amts.length || 1);
      const sd = Math.sqrt(amts.reduce((s, a) => s + (a - mean) ** 2, 0) / (amts.length || 1));
      const outliers = recent.filter((t) => Math.abs(t.amount) > mean + 4 * sd).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      return { title: "Ungewöhnlich große Buchungen (3 Monate)", note: `Schwelle: > ${formatCents(Math.round(mean + 4 * sd))}`, rows: txRows(outliers) };
    }
    const groups = new Map<string, typeof recent>();
    for (const t of recent) {
      const k = `${t.counterparty}|${t.amount}|${t.bookingDate.toISOString().slice(0, 10)}`;
      groups.set(k, [...(groups.get(k) ?? []), t]);
    }
    const dups = [...groups.values()].filter((g) => g.length > 1).flat().sort((a, b) => b.bookingDate.getTime() - a.bookingDate.getTime());
    return { title: "Mögliche Doppelbuchungen (3 Monate)", note: "Gleiche Gegenpartei, Betrag und Datum.", rows: txRows(dups) };
  }
  if (base === "recv.over90" || base === "recv.overdue" || base === "recv.singleLarge") {
    const items = await prisma.openItem.findMany({ where: { kind: "RECEIVABLE", paid: false, dueDate: { lt: today } }, orderBy: { dueDate: "asc" } });
    let filtered = items.filter((i) => openOf(i) > 0);
    if (base === "recv.over90") filtered = filtered.filter((i) => (today.getTime() - new Date(i.dueDate).getTime()) / 86400000 > 90);
    if (base === "recv.singleLarge") filtered = filtered.sort((a, b) => openOf(b) - openOf(a));
    const rows: AnomalyDetailRow[] = filtered.slice(0, LIMIT).map((i) => {
      const days = Math.floor((today.getTime() - new Date(i.dueDate).getTime()) / 86400000);
      return { label: i.counterparty || "Forderung", sub: i.reference ?? undefined, date: new Date(i.dueDate).toISOString().slice(0, 10), amount: openOf(i), badge: `${days} T überfällig` };
    });
    return { title: base === "recv.over90" ? "Forderungen über 90 Tage überfällig" : "Überfällige Forderungen", rows, pageHref: "/open-items?kind=RECEIVABLE&status=overdue", pageLabel: "In Offene Posten öffnen" };
  }
  if (base === "acc.negative" || base === "acc.empty") {
    const accts = await getAccountsWithBalance();
    const rows = accts
      .filter((a) => !a.excludedFromCalc && (base === "acc.negative" ? a.currentBalance < 0 : a.txCount === 0))
      .map((a) => ({ label: a.name, sub: `${a.txCount} Umsätze`, amount: a.currentBalance }));
    return { title: base === "acc.negative" ? "Konten mit negativem Saldo" : "Konten ohne Umsätze", rows, pageHref: "/accounts", pageLabel: "Zu Konten" };
  }
  if (base === "conc.top1") {
    const c = await getConcentration(12);
    const rows = c.debtors.map((d) => ({ label: d.name, sub: `${(d.share * 100).toFixed(1)} % der Erlöse`, amount: d.revenue }));
    return { title: "Auftraggeber nach Erlösanteil (12 Monate)", rows, pageHref: "/concentration", pageLabel: "Zur Klumpenrisiko-Analyse" };
  }
  if (base === "budget.over") {
    const b = await getCategoryBreakdown("month");
    const rows = [...b.incomeRows, ...b.expenseRows]
      .filter((r) => r.budgetPct != null && r.budgetPct > 1)
      .sort((a, b2) => (b2.budgetPct ?? 0) - (a.budgetPct ?? 0))
      .map((r) => ({ label: r.name, sub: `${Math.round((r.budgetPct ?? 0) * 100)} % des Jahresbudgets`, amount: r.yearActual }));
    return { title: "Kategorien über Jahresbudget", rows, pageHref: "/breakdown", pageLabel: "Zur Auswertung" };
  }
  if (base === "tax.due") {
    const vat = await getVatForecast(0, 2);
    const rows = vat.periods.map((p) => ({ label: p.label, sub: p.isEstimate ? "Schätzung" : "fällig " + new Date(p.dueDate).toLocaleDateString("de-DE"), amount: p.vatPayable }));
    return { title: "USt-Zahllast je Zeitraum", rows, pageHref: "/tax", pageLabel: "Zur Steuer-Vorschau" };
  }
  // Forecast-Meldungen: Verweis auf die Vorschau.
  return { title: "Details", rows: [], pageHref: "/forecast", pageLabel: "Zur 13-Wochen-Vorschau" };
}

/** Anomalien für eine bestimmte Seite (nur relevante Detektoren laufen). */
export async function getAnomaliesForPage(page: string): Promise<Anomaly[]> {
  const dets = PAGE_DETECTORS[page] ?? [];
  const results = await Promise.all(dets.map((d) => d().catch(() => [] as Anomaly[])));
  const forThisPage = dedupeSort(results.flat()).filter((a) => a.page === page || page === "/");
  return forThisPage;
}

/** Alle Anomalien (für Benachrichtigungen + E-Mail-Digest). */
export async function getAllAnomalies(): Promise<Anomaly[]> {
  const results = await Promise.all(ALL_DETECTORS.map((d) => d().catch(() => [] as Anomaly[])));
  return dedupeSort(results.flat());
}
