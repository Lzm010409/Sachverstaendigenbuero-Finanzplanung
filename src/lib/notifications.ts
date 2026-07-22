import { prisma } from "./db";
import { getForecast, getTotalBalanceCents } from "./queries";
import { getKpis } from "./analytics";
import { getPlanningSettings } from "./planning";
import { getReceivablesReport } from "./receivables";
import { getAllAnomalies } from "./anomalies";
import { todayUTC } from "./dates";
import { formatCents } from "./money";

export type AlertLevel = "info" | "warn" | "critical";

export interface Alert {
  level: AlertLevel;
  title: string;
  detail: string;
}

export interface Digest {
  generatedAt: string;
  balance: number;
  alerts: Alert[];
  openReceivables: number;
  openPayables: number;
  overdueReceivablesCount: number;
  overdueReceivablesAmount: number;
  lowestForecast: { date: string; balance: number };
}

/** Baut den Liquiditäts-Digest inkl. Anomalie-Meldungen (info/warn/error). */
export async function buildDigest(): Promise<Digest> {
  const today = todayUTC();
  const [balance, kpis, forecast, recv, anomalies] = await Promise.all([
    getTotalBalanceCents(),
    getKpis(),
    getForecast(90),
    getReceivablesReport(),
    getAllAnomalies(),
  ]);

  // Anomalien der Engine in Digest-Alarme übersetzen (error -> critical).
  const alerts: Alert[] = anomalies.map((a) => ({
    level: a.level === "error" ? "critical" : a.level,
    title: a.title,
    detail: a.detail,
  }));
  if (alerts.length === 0) {
    alerts.push({ level: "info", title: "Alles im grünen Bereich", detail: "Keine Auffälligkeiten erkannt." });
  }

  const overdueBuckets = recv.buckets.filter((b) => b.minDays >= 1);
  return {
    generatedAt: today.toISOString(),
    balance,
    alerts,
    openReceivables: kpis.openReceivables,
    openPayables: kpis.openPayables,
    overdueReceivablesCount: overdueBuckets.reduce((s, b) => s + b.count, 0),
    overdueReceivablesAmount: recv.overdueOpen,
    lowestForecast: { date: forecast.lowest.date, balance: forecast.lowest.balance },
  };
}

const COLOR: Record<AlertLevel, string> = { info: "#0f766e", warn: "#b45309", critical: "#b91c1c" };

export function digestToHtml(d: Digest): string {
  const rows = d.alerts
    .map(
      (a) =>
        `<tr><td style="padding:8px 12px;border-left:4px solid ${COLOR[a.level]};background:#f8fafc">` +
        `<strong style="color:${COLOR[a.level]}">${a.title}</strong><br><span style="color:#475569">${a.detail}</span></td></tr>`,
    )
    .join("");
  return `<div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
    <h2>Liquiditäts-Digest</h2>
    <p style="color:#64748b">Stand ${new Date(d.generatedAt).toLocaleString("de-DE")}</p>
    <p style="font-size:22px;margin:8px 0"><strong>Verfügbar: ${formatCents(d.balance)}</strong></p>
    <table style="width:100%;border-collapse:separate;border-spacing:0 6px">${rows}</table>
    <table style="width:100%;margin-top:12px;font-size:14px;color:#334155">
      <tr><td>Offene Forderungen</td><td align="right">${formatCents(d.openReceivables)}</td></tr>
      <tr><td>davon überfällig</td><td align="right">${formatCents(d.overdueReceivablesAmount)} (${d.overdueReceivablesCount})</td></tr>
      <tr><td>Offene Verbindlichkeiten</td><td align="right">${formatCents(d.openPayables)}</td></tr>
      <tr><td>Prognose-Tiefpunkt (90 T)</td><td align="right">${formatCents(d.lowestForecast.balance)} am ${new Date(d.lowestForecast.date).toLocaleDateString("de-DE")}</td></tr>
    </table>
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
      subject: `${hasCritical ? "⚠ " : ""}Liquiditäts-Digest — ${formatCents(d.balance)} verfügbar`,
      html: digestToHtml(d),
    });
    return { attempted: true, sent: true };
  } catch (e) {
    return { attempted: true, sent: false, reason: (e as Error).message };
  }
}
