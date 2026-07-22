import Link from "next/link";
import { buildDigest, type AlertLevel } from "@/lib/notifications";
import { getPlanningSettings } from "@/lib/planning";
import { formatCents } from "@/lib/money";
import { SendDigestButton } from "./send-button";

export const dynamic = "force-dynamic";

const STYLE: Record<AlertLevel, string> = {
  info: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  critical: "border-red-200 bg-red-50 text-red-800",
};
const ICON: Record<AlertLevel, string> = { info: "✓", warn: "🔔", critical: "⚠️" };

export default async function NotificationsPage() {
  const [digest, planning] = await Promise.all([buildDigest(), getPlanningSettings()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Benachrichtigungen</h1>
        <p className="text-sm text-slate-500">Liquiditäts-Digest &amp; Alarme, Stand {new Date(digest.generatedAt).toLocaleString("de-DE")}.</p>
      </div>

      <div className="space-y-3">
        {digest.alerts.map((a, i) => (
          <div key={i} className={`card flex items-start gap-3 border ${STYLE[a.level]}`}>
            <span className="text-xl">{ICON[a.level]}</span>
            <div className="text-sm">
              <strong>{a.title}</strong>
              <div>{a.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card"><div className="text-xs uppercase text-slate-500">Verfügbar</div><div className="mt-1 text-xl font-bold">{formatCents(digest.balance)}</div></div>
        <div className="card"><div className="text-xs uppercase text-slate-500">Offene Forderungen</div><div className="mt-1 text-xl font-bold text-emerald-600">{formatCents(digest.openReceivables)}</div></div>
        <div className="card"><div className="text-xs uppercase text-slate-500">Offene Verbindlichkeiten</div><div className="mt-1 text-xl font-bold text-red-600">{formatCents(digest.openPayables)}</div></div>
        <div className="card"><div className="text-xs uppercase text-slate-500">Prognose-Tiefpunkt (90 T)</div><div className="mt-1 text-xl font-bold">{formatCents(digest.lowestForecast.balance)}</div></div>
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">E-Mail-Versand</h2>
        <p className="text-sm text-slate-500">
          Empfänger: {planning.notifyEmail ? <strong>{planning.notifyEmail}</strong> : <span className="text-amber-600">nicht gesetzt (unter Einstellungen)</span>}.
          Für den Versand müssen zusätzlich <code className="text-xs">SMTP_HOST</code>, <code className="text-xs">SMTP_USER</code> und <code className="text-xs">SMTP_PASS</code> als Umgebungsvariablen gesetzt sein.
        </p>
        <SendDigestButton />
        <p className="text-xs text-slate-400">
          Automatischer Wochenversand: der Endpunkt <code>/api/notifications?send=1</code> (Token-gesichert)
          kann per Zeitplan aufgerufen werden. Einstellungen unter{" "}
          <Link href="/settings" className="text-brand underline">Einstellungen</Link>.
        </p>
      </div>
    </div>
  );
}
