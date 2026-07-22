import { getForecast, getTotalBalanceCents } from "./queries";
import { getKpis } from "./analytics";
import { getPlanningSettings, getWeeklyForecast } from "./planning";
import { getReceivablesReport, type AgingBucket } from "./receivables";
import { getVatForecast } from "./tax";
import { getAllAnomalies } from "./anomalies";
import { todayUTC } from "./dates";
import { formatCents } from "./money";

export type AlertLevel = "info" | "warn" | "critical";

export interface Alert {
  level: AlertLevel;
  title: string;
  detail: string;
  href?: string;
}

export interface Digest {
  generatedAt: string;
  balance: number;
  alerts: Alert[];
  // Kennzahlen
  avgMonthlyIncome: number;
  avgMonthlyExpense: number; // positiv
  netMonthly: number;
  runwayMonths: number | null;
  workingCapital: number;
  // Offene Posten
  openReceivables: number;
  openPayables: number;
  overdueReceivablesCount: number;
  overdueReceivablesAmount: number;
  dsoDays: number | null;
  aging: AgingBucket[];
  // Vorschau
  lowestForecast: { date: string; balance: number };
  minThreshold: number;
  week4In: number; // erwartete Einzahlungen nächste 4 Wochen
  week4Out: number; // erwartete Auszahlungen nächste 4 Wochen
  week4End: number; // Liquidität in 4 Wochen
  week13End: number; // Liquidität in 13 Wochen
  weekLowest: { label: string; balance: number };
  // Steuer
  nextVat: { label: string; amount: number; dueDate: string } | null;
}

/** Baut den umfassenden Liquiditäts-Digest (alle wichtigen Werte + Anomalien). */
export async function buildDigest(): Promise<Digest> {
  const today = todayUTC();
  const [balance, kpis, forecast, recv, anomalies, settings, weekly, vat] = await Promise.all([
    getTotalBalanceCents(),
    getKpis(),
    getForecast(90),
    getReceivablesReport(),
    getAllAnomalies(),
    getPlanningSettings(),
    getWeeklyForecast(13, undefined, 0),
    getVatForecast(0, 2).catch(() => null),
  ]);

  const alerts: Alert[] = anomalies.map((a) => ({
    level: a.level === "error" ? "critical" : a.level,
    title: a.title,
    detail: a.detail,
    href: a.href,
  }));
  if (alerts.length === 0) {
    alerts.push({ level: "info", title: "Alles im grünen Bereich", detail: "Keine Auffälligkeiten erkannt." });
  }

  const overdueBuckets = recv.buckets.filter((b) => b.minDays >= 1);
  const weeks = weekly.weeks;
  const first4 = weeks.slice(0, 4);
  const weekLowest = weeks.reduce((m, w) => (w.endLiquidity < m.endLiquidity ? w : m), weeks[0]);
  const nextVatP = vat?.periods.find((p) => new Date(p.dueDate) >= today && p.vatPayable > 0) ?? null;

  return {
    generatedAt: today.toISOString(),
    balance,
    alerts,
    avgMonthlyIncome: kpis.avgMonthlyIncome,
    avgMonthlyExpense: kpis.avgMonthlyExpense,
    netMonthly: kpis.netMonthly,
    runwayMonths: kpis.runwayMonths,
    workingCapital: kpis.workingCapital,
    openReceivables: kpis.openReceivables,
    openPayables: kpis.openPayables,
    overdueReceivablesCount: overdueBuckets.reduce((s, b) => s + b.count, 0),
    overdueReceivablesAmount: recv.overdueOpen,
    dsoDays: recv.dsoDays,
    aging: recv.buckets,
    lowestForecast: { date: forecast.lowest.date, balance: forecast.lowest.balance },
    minThreshold: settings.minLiquidityCents,
    week4In: first4.reduce((s, w) => s + w.inflow, 0),
    week4Out: first4.reduce((s, w) => s + w.outflow, 0),
    week4End: weeks[3]?.endLiquidity ?? balance,
    week13End: weeks[weeks.length - 1]?.endLiquidity ?? balance,
    weekLowest: { label: weekLowest?.label ?? "", balance: weekLowest?.endLiquidity ?? balance },
    nextVat: nextVatP ? { label: nextVatP.label, amount: nextVatP.vatPayable, dueDate: new Date(nextVatP.dueDate).toISOString() } : null,
  };
}

const COLOR: Record<AlertLevel, string> = { info: "#007FFF", warn: "#b45309", critical: "#b91c1c" };
const de = (c: number) => formatCents(c);
const deDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE");

export function digestToHtml(d: Digest): string {
  const appUrl = process.env.APP_URL || "https://finance.gollenstede.app";
  const alertRows = d.alerts
    .map(
      (a) =>
        `<tr><td style="padding:8px 12px;border-left:4px solid ${COLOR[a.level]};background:#f8fafc">` +
        `<strong style="color:${COLOR[a.level]}">${a.title}</strong><br><span style="color:#475569">${a.detail}</span>` +
        (a.href ? ` <a href="${appUrl}${a.href}" style="color:${COLOR[a.level]};font-size:12px">→ betroffene Objekte</a>` : "") +
        `</td></tr>`,
    )
    .join("");

  const kv = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:5px 0;color:#475569">${label}</td><td align="right" style="padding:5px 0;${strong ? "font-weight:700;" : ""}color:#0f172a">${value}</td></tr>`;

  const agingRows = d.aging
    .filter((b) => b.amount > 0)
    .map((b) => `<tr><td style="padding:3px 0;color:#475569">${b.label}</td><td align="right" style="color:#0f172a">${de(b.amount)} <span style="color:#94a3b8">(${b.count})</span></td></tr>`)
    .join("");

  const section = (title: string, body: string) =>
    `<h3 style="margin:18px 0 6px;font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">${title}</h3>${body}`;

  const belowThreshold = d.minThreshold > 0 && d.weekLowest.balance < d.minThreshold;

  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
    <h2 style="margin:0">Wöchentlicher Liquiditätsbericht</h2>
    <p style="color:#64748b;margin:4px 0 12px">Gollenstede Sachverstand · Stand ${new Date(d.generatedAt).toLocaleDateString("de-DE")}</p>
    <div style="background:#007FFF;color:#fff;border-radius:10px;padding:16px 18px;margin-bottom:8px">
      <div style="font-size:12px;text-transform:uppercase;opacity:.85">Verfügbare Liquidität</div>
      <div style="font-size:26px;font-weight:700">${de(d.balance)}</div>
    </div>

    ${section("Auffälligkeiten", `<table style="width:100%;border-collapse:separate;border-spacing:0 6px">${alertRows}</table>`)}

    ${section("Kennzahlen", `<table style="width:100%;font-size:14px">
      ${kv("Ø Einnahmen / Monat", de(d.avgMonthlyIncome))}
      ${kv("Ø Ausgaben / Monat", de(-d.avgMonthlyExpense))}
      ${kv("Netto / Monat", de(d.netMonthly))}
      ${kv("Reichweite", d.runwayMonths == null ? "∞" : `${d.runwayMonths} Monate`)}
      ${kv("Working Capital", de(d.workingCapital), true)}
    </table>`)}

    ${section("Offene Posten", `<table style="width:100%;font-size:14px">
      ${kv("Offene Forderungen", de(d.openReceivables))}
      ${kv("davon überfällig", `${de(d.overdueReceivablesAmount)} (${d.overdueReceivablesCount})`)}
      ${kv("Ø Zahlungsdauer (DSO)", d.dsoDays != null ? `${d.dsoDays} Tage` : "—")}
      ${kv("Offene Verbindlichkeiten", de(d.openPayables))}
    </table>
    <div style="font-size:13px;color:#64748b;margin-top:6px">Fälligkeitsstruktur:</div>
    <table style="width:100%;font-size:13px">${agingRows}</table>`)}

    ${section("Liquiditätsausblick", `<table style="width:100%;font-size:14px">
      ${kv("Erwartete Einzahlungen (4 Wo.)", de(d.week4In))}
      ${kv("Erwartete Auszahlungen (4 Wo.)", de(-d.week4Out))}
      ${kv("Liquidität in 4 Wochen", de(d.week4End))}
      ${kv("Liquidität in 13 Wochen", de(d.week13End), true)}
      ${kv("Tiefpunkt (13 Wo.)", `${de(d.weekLowest.balance)}${d.weekLowest.label ? ` (${d.weekLowest.label})` : ""}`)}
      ${d.minThreshold > 0 ? kv("Mindestliquidität", `${de(d.minThreshold)}${belowThreshold ? " ⚠ unterschritten" : " ✓"}`) : ""}
      ${kv("Prognose-Tiefpunkt (90 T)", `${de(d.lowestForecast.balance)} am ${deDate(d.lowestForecast.date)}`)}
    </table>`)}

    ${d.nextVat ? section("Steuer", `<table style="width:100%;font-size:14px">${kv(`Nächste USt-Zahllast (${d.nextVat.label})`, `${de(d.nextVat.amount)} zum ${deDate(d.nextVat.dueDate)}`, true)}</table>`) : ""}

    <p style="margin-top:22px;font-size:12px;color:#94a3b8">Automatischer Wochenbericht der Liquiditätsplanung. Details unter finance.gollenstede.app.</p>
  </div>`;
}

export interface MailResult {
  attempted: boolean;
  sent: boolean;
  reason?: string;
}

/** Versendet den Digest per SMTP, sofern SMTP_* + Empfänger konfiguriert sind. */
export async function sendDigestEmail(d: Digest): Promise<MailResult> {
  const settings = await getPlanningSettings();
  const to = settings.notifyEmail;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  if (!to) return { attempted: false, sent: false, reason: "Kein Empfänger (Einstellungen → Benachrichtigungen)" };
  if (!host || !user || !pass) return { attempted: false, sent: false, reason: "SMTP nicht konfiguriert (SMTP_HOST/USER/PASS)" };

  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user, pass },
    });
    const hasCritical = d.alerts.some((a) => a.level === "critical");
    await transport.sendMail({
      from,
      to,
      subject: `${hasCritical ? "⚠ " : ""}Liquiditätsbericht — ${formatCents(d.balance)} verfügbar`,
      html: digestToHtml(d),
    });
    return { attempted: true, sent: true };
  } catch (e) {
    return { attempted: true, sent: false, reason: (e as Error).message };
  }
}
