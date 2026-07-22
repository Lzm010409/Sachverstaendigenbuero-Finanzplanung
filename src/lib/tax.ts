import { cache } from "react";
import { prisma } from "./db";
import { INCLUDED_ACCOUNT } from "./queries";
import { getPlanningSettings } from "./planning";
import { getSevdeskToken } from "./settings";
import { fetchVatEntries } from "./sevdesk";
import { addMonths, todayUTC } from "./dates";

export interface VatPeriod {
  label: string; // "Jul 2026"
  periodStart: Date;
  periodEnd: Date; // exklusiv
  dueDate: Date; // Fälligkeit der Voranmeldung (10. des Folgemonats)
  vatOnRevenue: number; // USt auf Erlöse (Cent)
  vatOnCost: number; // Vorsteuer (Cent)
  vatPayable: number; // Zahllast (Cent, positiv = zahlen)
  isEstimate: boolean;
  paid: boolean;
}

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * USt-Zahllast je Voranmeldungszeitraum. Bevorzugt echte sevDesk-Steuerbeträge
 * (nur Belege/Rechnungen in EUR mit MwSt > 0); ohne Token wird aus den gebuchten
 * Umsätzen bei einheitlichem Satz geschätzt. Standard-Zyklus: monatlich.
 */
export const getVatForecast = cache(async (periodsBack = 2, periodsForward = 2): Promise<{
  ratePercent: number;
  cycle: "monthly" | "quarterly";
  source: "sevdesk" | "geschätzt";
  periods: VatPeriod[];
}> => {
  const { vatRatePercent, vatCycle } = await getPlanningSettings();
  const today = todayUTC();
  const stepMonths = vatCycle === "monthly" ? 1 : 3;
  const curMonth = today.getUTCMonth();
  const periodStartMonth = vatCycle === "monthly" ? curMonth : Math.floor(curMonth / stepMonths) * stepMonths;
  const base = new Date(Date.UTC(today.getUTCFullYear(), periodStartMonth, 1));

  // 1) Echte Steuerdaten aus sevDesk (falls verfügbar).
  const token = await getSevdeskToken();
  let vat: Awaited<ReturnType<typeof fetchVatEntries>> | null = null;
  if (token) {
    try {
      vat = await fetchVatEntries(token);
    } catch {
      vat = null;
    }
  }

  // 2) Fallback: Schätzung aus Umsätzen bei einheitlichem Satz.
  const rate = vatRatePercent / 100;
  const categories = vat ? [] : await prisma.category.findMany({ select: { id: true, kind: true } });
  const incomeIds = new Set(categories.filter((c) => c.kind === "INCOME").map((c) => c.id));

  const periods: VatPeriod[] = [];
  for (let i = -periodsBack; i <= periodsForward; i++) {
    const periodStart = addMonths(base, i * stepMonths);
    const periodEnd = addMonths(periodStart, stepMonths);
    const dueDate = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), 10));

    let vatOnRevenue = 0;
    let vatOnCost = 0;
    if (vat) {
      // Über alle Monate des Zeitraums summieren (bei monatlich = ein Monat).
      for (let m = new Date(periodStart); m < periodEnd; m = addMonths(m, 1)) {
        const k = monthKey(m);
        vatOnRevenue += vat.outputByMonth[k] ?? 0;
        vatOnCost += vat.inputByMonth[k] ?? 0;
      }
    } else {
      const txs = await prisma.transaction.findMany({
        where: { bookingDate: { gte: periodStart, lt: periodEnd }, account: INCLUDED_ACCOUNT },
        select: { amount: true, categoryId: true },
      });
      let revenueNet = 0;
      let costNet = 0;
      for (const t of txs) {
        const isIncome = t.categoryId ? incomeIds.has(t.categoryId) : t.amount > 0;
        const net = Math.abs(t.amount) / (1 + rate);
        if (isIncome) revenueNet += net;
        else costNet += net;
      }
      vatOnRevenue = Math.round(revenueNet * rate);
      vatOnCost = Math.round(costNet * rate);
    }

    const label = vatCycle === "quarterly"
      ? `Q${Math.floor(periodStart.getUTCMonth() / 3) + 1} ${periodStart.getUTCFullYear()}`
      : `${MONTHS[periodStart.getUTCMonth()]} ${periodStart.getUTCFullYear()}`;

    periods.push({
      label,
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
  return { ratePercent: vatRatePercent, cycle: vatCycle, source: vat ? "sevdesk" : "geschätzt", periods };
});
