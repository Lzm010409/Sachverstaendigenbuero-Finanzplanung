import { getSettings, getBranding } from "@/lib/settings";
import { getPlanningSettings } from "@/lib/planning";
import { prisma } from "@/lib/db";
import { toggleIntegration, saveIntegrationToken, savePipedriveConfig, saveBranding, removeBrandingLogo } from "@/app/actions/settings";
import { savePlanningSettings } from "@/app/actions/planning-settings";
import { SevdeskSync } from "./sevdesk-sync";
import { PipedriveSync } from "./pipedrive-sync";

export const dynamic = "force-dynamic";

function euroInput(cents: number): string {
  return cents > 0 ? (cents / 100).toFixed(2).replace(".", ",") : "";
}

function Toggle({ name, enabled }: { name: string; enabled: boolean }) {
  return (
    <form action={toggleIntegration}>
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <button
        type="submit"
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${enabled ? "bg-brand" : "bg-slate-300"}`}
        aria-pressed={enabled}
        title={enabled ? "Aktiviert – klicken zum Deaktivieren" : "Deaktiviert – klicken zum Aktivieren"}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${enabled ? "translate-x-5" : "translate-x-1"}`}
        />
      </button>
    </form>
  );
}

export default async function SettingsPage() {
  const s = await getSettings([
    "sevdesk.enabled",
    "sevdesk.token",
    "sevdesk.lastSync",
    "pipedrive.enabled",
    "pipedrive.token",
    "pipedrive.domain",
    "pipedrive.lastSync",
    "notify.weekly",
    "notify.weeklyDay",
    "notify.weeklyHour",
    "notify.lastWeeklySent",
    "sync.dailyEnabled",
    "sync.dailyHour",
    "sync.lastDailyRun",
    "branding.company",
  ]);
  const weeklyEnabled = s["notify.weekly"] === "true";
  const weeklyDay = Number(s["notify.weeklyDay"] ?? "1");
  const weeklyHour = Number(s["notify.weeklyHour"] ?? "6");
  const syncDailyEnabled = s["sync.dailyEnabled"] !== "false"; // Standard: aktiv
  const syncDailyHour = Number(s["sync.dailyHour"] ?? "4");
  const smtpConfigured = !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
  const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const sevEnabled = s["sevdesk.enabled"] === "true";
  const sevTokenFromEnv = !!process.env.SEVDESK_API_TOKEN && !s["sevdesk.token"];
  const sevTokenSet = !!s["sevdesk.token"] || !!process.env.SEVDESK_API_TOKEN;
  const pipeEnabled = s["pipedrive.enabled"] === "true";
  const pipeTokenSet = !!s["pipedrive.token"] || !!process.env.PIPEDRIVE_API_TOKEN;
  const pipeDomainSet = !!s["pipedrive.domain"] || !!process.env.PIPEDRIVE_COMPANY_DOMAIN;
  const contactCount = await prisma.contact.count();
  const plan = await getPlanningSettings();
  const branding = await getBranding();
  const hasLogo = !!branding.logoUrl;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Einstellungen</h1>
      <p className="-mt-4 text-sm text-slate-500">Integrationen, Planung und Benachrichtigungen.</p>

      {/* Firmenlogo & -name (Branding) */}
      <div className="card space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Firmenlogo &amp; -name</h2>
          <p className="text-sm text-slate-500">
            Erscheint in der Seitenleiste (Website) und im Kopf der Berichte/PDFs. Empfohlen: PNG mit
            transparentem Hintergrund, quer, max. 400&nbsp;KB.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex h-20 w-52 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-2">
            {hasLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl!} alt={branding.company} className="max-h-16 max-w-full object-contain" />
            ) : (
              <span className="text-xs text-slate-400">Kein Logo hinterlegt</span>
            )}
          </div>
          {hasLogo && (
            <form action={removeBrandingLogo} data-toast="Logo entfernt">
              <button className="text-xs text-slate-400 hover:text-red-600">Logo entfernen</button>
            </form>
          )}
        </div>
        <form action={saveBranding} data-toast="Branding gespeichert" className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="label">Firmenname</label>
            <input name="company" defaultValue={s["branding.company"] ?? ""} className="input" placeholder={branding.company} />
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="label">Logo hochladen (PNG, JPG, WebP, SVG)</label>
            <input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="input py-1.5" />
          </div>
          <button className="btn-primary" type="submit">Speichern</button>
        </form>
      </div>

      {/* Planung & Benachrichtigungen */}
      <div className="card space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Planung &amp; Benachrichtigungen</h2>
          <p className="text-sm text-slate-500">
            Mindestliquidität, USt-Vorschau und E-Mail-Empfänger für den Liquiditäts-Digest.
          </p>
        </div>
        <form action={savePlanningSettings} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">Mindestliquidität (€)</label>
            <input name="minLiquidity" defaultValue={euroInput(plan.minLiquidityCents)} className="input" inputMode="decimal" placeholder="z.B. 20000" />
            <p className="mt-1 text-xs text-slate-400">Warnung bei Unterschreitung.</p>
          </div>
          <div>
            <label className="label">USt-Satz (%)</label>
            <input name="vatRate" defaultValue={String(plan.vatRatePercent).replace(".", ",")} className="input" inputMode="decimal" placeholder="19" />
          </div>
          <div>
            <label className="label">USt-Voranmeldung</label>
            <select name="vatPrepayCycle" defaultValue={plan.vatCycle} className="input">
              <option value="monthly">monatlich</option>
              <option value="quarterly">vierteljährlich</option>
            </select>
          </div>
          <div>
            <label className="label">Digest-E-Mail</label>
            <input name="notifyEmail" defaultValue={plan.notifyEmail ?? ""} className="input" type="email" placeholder="name@firma.de" />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <button className="btn-primary" type="submit">Speichern</button>
            <span className="ml-3 text-xs text-slate-400">
              E-Mail-Versand benötigt zusätzlich SMTP-Zugangsdaten (SMTP_HOST/USER/PASS als Umgebungsvariablen).
            </span>
          </div>
        </form>

        {/* Wöchentlicher Bericht */}
        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-700">Automatischer Wochenbericht</h3>
          <p className="mb-3 mt-1 text-xs text-slate-500">
            Versendet einmal pro Woche einen vollständigen Liquiditätsbericht (Kennzahlen, offene Posten,
            13-Wochen-Ausblick, Steuer, Auffälligkeiten) an die oben hinterlegte E-Mail.
          </p>
          <form action={savePlanningSettings} className="flex flex-wrap items-end gap-4">
            <input type="hidden" name="notifyWeeklySection" value="1" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="notifyWeekly" defaultChecked={weeklyEnabled} className="h-4 w-4" />
              aktiv
            </label>
            <div>
              <label className="label">Wochentag</label>
              <select name="notifyWeeklyDay" defaultValue={String(weeklyDay)} className="input w-auto">
                {WEEKDAYS.map((w, i) => (
                  <option key={i} value={i}>{w}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Uhrzeit (UTC)</label>
              <select name="notifyWeeklyHour" defaultValue={String(weeklyHour)} className="input w-auto">
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
            </div>
            <button className="btn-secondary" type="submit">Wochenversand speichern</button>
          </form>
          <p className="mt-2 text-xs text-slate-400">
            {smtpConfigured ? (
              <span className="text-emerald-600">SMTP konfiguriert ✓</span>
            ) : (
              <span className="text-amber-600">SMTP fehlt — bitte SMTP_HOST/USER/PASS als Umgebungsvariablen setzen.</span>
            )}
            {s["notify.lastWeeklySent"] && ` · Zuletzt versendet: ${new Date(s["notify.lastWeeklySent"]).toLocaleString("de-DE")}`}
            {" · Hinweis: Uhrzeit in UTC (DE = UTC+1/+2)."}
          </p>
        </div>

        {/* Täglicher Datenabgleich */}
        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-700">Täglicher Datenabgleich</h3>
          <p className="mb-3 mt-1 text-xs text-slate-500">
            Zieht einmal täglich automatisch neue <strong>Umsätze</strong> und <strong>Belege</strong> aus
            sevDesk sowie <strong>Kontakte</strong> aus Pipedrive – nutzt dieselben Integrationen wie die
            manuellen Schaltflächen unten.
          </p>
          <form action={savePlanningSettings} className="flex flex-wrap items-end gap-4">
            <input type="hidden" name="syncDailySection" value="1" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="syncDaily" defaultChecked={syncDailyEnabled} className="h-4 w-4" />
              aktiv
            </label>
            <div>
              <label className="label">Uhrzeit (UTC)</label>
              <select name="syncDailyHour" defaultValue={String(syncDailyHour)} className="input w-auto">
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
            </div>
            <button className="btn-secondary" type="submit">Täglichen Abgleich speichern</button>
          </form>
          <p className="mt-2 text-xs text-slate-400">
            {syncDailyEnabled ? (
              <span className="text-emerald-600">aktiv ✓</span>
            ) : (
              <span className="text-slate-500">deaktiviert</span>
            )}
            {s["sync.lastDailyRun"] && ` · Zuletzt gelaufen: ${new Date(s["sync.lastDailyRun"]).toLocaleString("de-DE")}`}
            {" · Setzt aktive sevDesk-/Pipedrive-Integrationen voraus. Uhrzeit in UTC."}
          </p>
        </div>
      </div>

      {/* sevDesk */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">sevDesk</h2>
            <p className="text-sm text-slate-500">
              Bankumsätze aller sevDesk-Konten automatisch importieren (Konten + Umsätze).
            </p>
          </div>
          <Toggle name="sevdesk" enabled={sevEnabled} />
        </div>

        <div className="text-xs text-slate-500">
          Token:{" "}
          {sevTokenFromEnv ? (
            <span className="text-emerald-600">aus Umgebungsvariable (SEVDESK_API_TOKEN)</span>
          ) : sevTokenSet ? (
            <span className="text-emerald-600">hinterlegt</span>
          ) : (
            <span className="text-amber-600">nicht gesetzt</span>
          )}
        </div>

        <form action={saveIntegrationToken} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="name" value="sevdesk" />
          <div className="min-w-[240px] flex-1">
            <label className="label">API-Token (optional, überschreibt Umgebungsvariable)</label>
            <input name="token" type="password" className="input" placeholder="sevDesk API-Token" />
          </div>
          <button className="btn-secondary" type="submit">
            Token speichern
          </button>
        </form>

        {sevEnabled ? (
          <div className="border-t border-slate-100 pt-4">
            <SevdeskSync />
            {s["sevdesk.lastSync"] && (
              <p className="mt-2 text-xs text-slate-400">
                Letzte Synchronisierung: {new Date(s["sevdesk.lastSync"]).toLocaleString("de-DE")}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400">Aktiviere die Integration, um zu synchronisieren.</p>
        )}
      </div>

      {/* Pipedrive */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Pipedrive</h2>
            <p className="text-sm text-slate-500">
              Kontakte (Personen &amp; Organisationen) aus Pipedrive synchronisieren.
            </p>
          </div>
          <Toggle name="pipedrive" enabled={pipeEnabled} />
        </div>

        <div className="text-xs text-slate-500">
          Token: {pipeTokenSet ? <span className="text-emerald-600">verfügbar</span> : <span className="text-amber-600">nicht gesetzt</span>}
          {" · "}Domain: {pipeDomainSet ? <span className="text-emerald-600">verfügbar</span> : <span className="text-amber-600">nicht gesetzt</span>}
          {" · "}Kontakte: <strong>{contactCount}</strong>
        </div>

        <form action={savePipedriveConfig} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label className="label">API-Token (in DB gespeichert)</label>
            <input name="token" type="password" className="input" placeholder="Pipedrive API-Token" />
          </div>
          <div className="min-w-[160px]">
            <label className="label">Firmen-Domain</label>
            <input name="domain" className="input" placeholder="z.B. meinefirma" />
          </div>
          <button className="btn-secondary" type="submit">
            Speichern
          </button>
        </form>

        {pipeEnabled ? (
          <div className="border-t border-slate-100 pt-4">
            <PipedriveSync />
            {s["pipedrive.lastSync"] && (
              <p className="mt-2 text-xs text-slate-400">
                Letzte Synchronisierung: {new Date(s["pipedrive.lastSync"]).toLocaleString("de-DE")}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400">Aktiviere die Integration, um zu synchronisieren.</p>
        )}
      </div>
    </div>
  );
}
