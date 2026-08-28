// Aggregat-only Datenschicht für den externen Abfrage-Zugriff (MCP-Connector).
// STRIKTE REGEL: Es werden NUR nicht-identifizierende Aggregate ausgegeben –
// keine Gegenpartei-Klarnamen, keine IBANs, keine Einzeltransaktionen. Beträge
// in EUR (aus Cent gerundet). So kann nichts Personenbezogenes in einen
// Chatverlauf gelangen.

import { getKpis, getBudgetStatus } from "./analytics";
import { getWeeklyForecast, findThresholdBreach, getPlanningSettings } from "./planning";
import { getForecast } from "./queries";
import { getReceivablesReport } from "./receivables";
import { getVatForecast } from "./tax";
import { getConcentration } from "./concentration";

const e = (c: number) => Math.round(c) / 100;
const pct = (x: number) => Math.round(x * 1000) / 10; // 0..1 -> Prozent 1 Nachkomma

export async function agentKpis() {
  const k = await getKpis();
  return {
    currency: "EUR",
    verfuegbareLiquiditaet: e(k.currentBalance),
    oEinnahmenProMonat: e(k.avgMonthlyIncome),
    oAusgabenProMonat: e(k.avgMonthlyExpense),
    nettoProMonat: e(k.netMonthly),
    reichweiteMonate: k.runwayMonths,
    offeneForderungen: e(k.openReceivables),
    offeneVerbindlichkeiten: e(k.openPayables),
    workingCapital: e(k.workingCapital),
  };
}

export async function agentForecast() {
  const planning = await getPlanningSettings();
  const [weekly, forecast] = await Promise.all([getWeeklyForecast(13, undefined, 0), getForecast(180)]);
  const breach = findThresholdBreach(forecast, planning.minLiquidityCents);
  const low = weekly.weeks.reduce((m, w) => (w.endLiquidity < m.endLiquidity ? w : m), weekly.weeks[0]);
  return {
    currency: "EUR",
    startLiquiditaet: e(weekly.startBalance),
    mindestliquiditaetSchwelle: e(planning.minLiquidityCents),
    tiefpunkt13Wochen: low ? { woche: low.label, liquiditaet: e(low.endLiquidity) } : null,
    schwelleUnterschritten: breach
      ? { datum: breach.date, inTagen: breach.daysAway, liquiditaet: e(breach.balance), schwelle: e(breach.threshold) }
      : null,
    prognoseEndeTag180: e(forecast.endBalance),
    wochen: weekly.weeks.map((w) => ({
      woche: w.label,
      startLiquiditaet: e(w.startLiquidity),
      zufluss: e(w.inflow),
      abfluss: e(w.outflow),
      netto: e(w.net),
      endLiquiditaet: e(w.endLiquidity),
    })),
  };
}

export async function agentOpenItemsAging() {
  const [rec, conc] = await Promise.all([getReceivablesReport(), getConcentration(12, 5)]);
  return {
    currency: "EUR",
    forderungen: {
      offenGesamt: e(rec.totalOpen),
      ueberfaellig: e(rec.overdueOpen),
      anzahlOffen: rec.count,
      dsoTage: rec.dsoDays,
      altersstruktur: rec.buckets.map((b) => ({ bereich: b.label, anzahl: b.count, betrag: e(b.amount) })),
    },
    // Klumpenrisiko – ANONYMISIERT (nur Ränge/Anteile, keine Namen).
    klumpenrisiko: {
      zeitraumMonate: conc.months,
      erloeseGesamt: e(conc.totalRevenue),
      hhi: conc.hhi,
      top1AnteilProzent: pct(conc.top1Share),
      top3AnteilProzent: pct(conc.top3Share),
      topDebitoren: conc.debtors.map((d, i) => ({
        rang: i + 1,
        anteilProzent: pct(d.share),
        offeneForderung: e(d.openReceivable),
      })),
    },
  };
}

export async function agentTax() {
  const vat = await getVatForecast(1, 3);
  return {
    currency: "EUR",
    satzProzent: vat.ratePercent,
    rhythmus: vat.cycle === "monthly" ? "monatlich" : "quartalsweise",
    quelle: vat.source,
    perioden: vat.periods.map((p) => ({
      periode: p.label,
      faellig: p.dueDate.toISOString().slice(0, 10),
      ustAufErloese: e(p.vatOnRevenue),
      vorsteuer: e(p.vatOnCost),
      zahllast: e(p.vatPayable),
      geschaetzt: p.isEstimate,
      bezahlt: p.paid,
    })),
  };
}

export async function agentBudgets() {
  const b = await getBudgetStatus();
  return {
    currency: "EUR",
    monat: b.monthLabel,
    tagImMonat: `${b.daysElapsed}/${b.daysInMonth}`,
    ausgabenBudgetGesamt: e(b.totalExpenseBudget),
    ausgabenIstGesamt: e(b.totalExpenseActual),
    ueberBudget: b.overCount,
    nahAmLimit: b.atRiskCount,
    kategorien: b.rows.map((r) => ({
      kategorie: r.name, // Kategoriename (generisch, kein Personenbezug)
      art: r.kind === "INCOME" ? "Einnahme" : "Ausgabe",
      monatsbudget: e(r.monthlyBudget),
      ist: e(r.actual),
      hochrechnung: e(r.projected),
      auslastungProzent: Math.round(r.pct * 100),
      status: r.status,
    })),
  };
}

export async function agentSummary() {
  const [kpis, forecast, aging, tax, budgets] = await Promise.all([
    agentKpis(),
    agentForecast(),
    agentOpenItemsAging(),
    agentTax(),
    agentBudgets(),
  ]);
  return { kpis, forecast, aging, tax, budgets };
}
