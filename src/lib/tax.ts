import { prisma } from "./db";
import { INCLUDED_ACCOUNT } from "./queries";
import { getPlanningSettings } from "./planning";
import { addMonths, todayUTC } from "./dates";

export interface VatPeriod {
  label: string; // "Q3 2026" / "Jul 2026"
  periodStart: Date;
  periodEnd: Date; // exklusiv
  dueDate: Date; // Fälligkeit der Vorauszahlung (10. des Folgemonats + Dauerfristverlängerung 1 Mon.)
  vatOnRevenue: number; // USt auf Erlöse (Cent)
  vatOnCost: number; // Vorsteuer (Cent)
  vatPayable: number; // Zahllast (Cent, positiv = zahlen)
  isEstimate: boolean;
  paid: boolean;
}

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/**
 * Schätzt die USt-Zahllast je Voranmeldungszeitraum aus den kategorisierten
 * Umsätzen (Erlöse -> USt, Ausgaben -> Vorsteuer) beim eingestellten Satz.
 * Vereinfachung: ein einheitlicher Satz; Kleinunternehmer/§13b unberücksichtigt.
 */
export async function getVatForecast(periodsBack = 2, periodsForward = 2): Promise<{
  ratePercent: number;
  cycle: "monthly" | "quarterly";
  periods: VatPeriod[];
}> {
  const { vatRatePercent, vatCycle } = await getPlanningSettings();
  const rate = vatRatePercent / 100;
  const today = todayUTC();
  const stepMonths = vatCycle === "monthly" ? 1 : 3;

  // Referenz: aktueller Zeitraum-Start.
  const curMonth = today.getUTCMonth();
  const periodStartMonth = vatCycle === "monthly" ? curMonth : Math.floor(curMonth / stepMonths) * stepMonths;
  const base = new Date(Date.UTC(today.getUTCFullYear(), periodStartMonth, 1));

  const categories = await prisma.category.findMany({ select: { id: true, kind: true } });
  const incomeIds = new Set(categories.filter((c) => c.kind === "INCOME").map((c) => c.id));

  const periods: VatPeriod[] = [];
  for (let i = -periodsBack; i <= periodsForward; i++) {
    const periodStart = addMonths(base, i * stepMonths);
    const periodEnd = addMonths(periodStart, stepMonths);
    // Fälligkeit: 10. des auf den Zeitraum folgenden Monats (mit
    // Dauerfristverlängerung praktisch +1 Monat) -> hier 10. Folgemonat.
    const dueDate = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), 10));

    const txs = await prisma.transaction.findMany({
      where: { bookingDate: { gte: periodStart, lt: periodEnd }, account: INCLUDED_ACCOUNT },
      select: { amount: true, categoryId: true },
    });
    let revenueNet = 0;
    let costNet = 0;
    for (const t of txs) {
      // Brutto -> Netto: /(1+rate). Erlöse anhand Kategorie ODER positivem Betrag.
      const isIncome = t.categoryId ? incomeIds.has(t.categoryId) : t.amount > 0;
      const net = Math.abs(t.amount) / (1 + rate);
      if (isIncome) revenueNet += net;
      else costNet += net;
    }
    const vatOnRevenue = Math.round(revenueNet * rate);
    const vatOnCost = Math.round(costNet * rate);
    const q = vatCycle === "quarterly" ? `Q${Math.floor(periodStart.getUTCMonth() / 3) + 1} ${periodStart.getUTCFullYear()}` : `${MONTHS[periodStart.getUTCMonth()]} ${periodStart.getUTCFullYear()}`;

    periods.push({
      label: q,
      periodStart,
      periodEnd,
      dueDate,
      vatOnRevenue,
      vatOnCost,
      vatPayable: vatOnRevenue - vatOnCost,
      isEstimate: periodEnd > today,
      paid: dueDate < today,
    });
  }
  return { ratePercent: vatRatePercent, cycle: vatCycle, periods };
}
