import { runDiagnostics, type CheckStatus } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

// Deep-Prüfung (Live-Integrationsaufrufe) nur, wenn ?deep=1 gesetzt ist, damit
// der normale Seitenaufruf schnell bleibt.
export default async function DiagnosticsPage({
  searchParams,
}: {
  searchParams: Promise<{ deep?: string }>;
}) {
  const sp = await searchParams;
  const deep = sp.deep === "1" || sp.deep === "true";
  const report = await runDiagnostics({ deep });

  const badge: Record<CheckStatus, string> = {
    pass: "bg-emerald-100 text-emerald-700",
    warn: "bg-amber-100 text-amber-700",
    fail: "bg-red-100 text-red-700",
  };
  const icon: Record<CheckStatus, string> = { pass: "✓", warn: "!", fail: "✗" };
  const label: Record<CheckStatus, string> = { pass: "OK", warn: "Hinweis", fail: "Fehler" };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Selbsttest</h1>
        <div className="flex items-center gap-2">
          <a href="/diagnostics" className={deep ? "btn-secondary" : "btn-primary"}>
            Schnell
          </a>
          <a href="/diagnostics?deep=1" className={deep ? "btn-primary" : "btn-secondary"}>
            Mit Integrationen
          </a>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <span className={`badge ${badge[report.status]} text-base`}>
            {icon[report.status]} Gesamt: {label[report.status]}
          </span>
          <span className="text-sm text-slate-500">
            {report.counts.pass}&nbsp;OK · {report.counts.warn}&nbsp;Hinweise ·{" "}
            {report.counts.fail}&nbsp;Fehler · {report.counts.total} Prüfungen · {report.durationMs}&nbsp;ms
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Geprüft am {new Date(report.startedAt).toLocaleString("de-DE")}
          {report.deep ? " · inkl. Live-Integrationsprüfung" : " · ohne Integrationsprüfung"}
        </p>
      </div>

      {report.suites.map((suite) => (
        <div key={suite.name} className="card">
          <div className="mb-3 flex items-center gap-2">
            <span className={`badge ${badge[suite.status]}`}>{icon[suite.status]}</span>
            <h2 className="text-sm font-semibold text-slate-700">{suite.name}</h2>
            <span className="text-xs text-slate-400">({suite.durationMs} ms)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <tbody>
                {suite.checks.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50">
                    <td className="td w-8 align-top">
                      <span className={`badge ${badge[c.status]}`}>{icon[c.status]}</span>
                    </td>
                    <td className="td align-top font-medium text-slate-700">{c.name}</td>
                    <td className="td align-top text-slate-500">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {report.voucherClassification && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Beleg-Klassifikation (sevDesk)</h2>
          <pre className="overflow-x-auto rounded bg-slate-50 p-3 text-xs text-slate-600">
            {JSON.stringify(report.voucherClassification, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
