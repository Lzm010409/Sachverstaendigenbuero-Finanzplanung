import { getSettings } from "@/lib/settings";
import { toggleIntegration, saveIntegrationToken } from "@/app/actions/settings";
import { SevdeskSync } from "./sevdesk-sync";

export const dynamic = "force-dynamic";

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
  ]);
  const sevEnabled = s["sevdesk.enabled"] === "true";
  const sevTokenFromEnv = !!process.env.SEVDESK_API_TOKEN && !s["sevdesk.token"];
  const sevTokenSet = !!s["sevdesk.token"] || !!process.env.SEVDESK_API_TOKEN;
  const pipeEnabled = s["pipedrive.enabled"] === "true";
  const pipeTokenSet = !!s["pipedrive.token"] || !!process.env.PIPEDRIVE_API_TOKEN;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Einstellungen</h1>
      <p className="-mt-4 text-sm text-slate-500">Integrationen aktivieren und synchronisieren.</p>

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
              Kontakte aus Pipedrive für die Zuordnung von Gegenparteien (in Vorbereitung).
            </p>
          </div>
          <Toggle name="pipedrive" enabled={pipeEnabled} />
        </div>
        <div className="text-xs text-slate-500">
          Token: {pipeTokenSet ? <span className="text-emerald-600">verfügbar</span> : <span className="text-amber-600">nicht gesetzt</span>}
        </div>
      </div>
    </div>
  );
}
