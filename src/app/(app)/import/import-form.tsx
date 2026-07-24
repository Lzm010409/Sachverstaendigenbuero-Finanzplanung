"use client";

import { useActionState } from "react";
import { importStatement, type ImportSummary } from "@/app/actions/import";

export function ImportForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(
    async (_p: ImportSummary, fd: FormData) => importStatement(fd),
    {},
  );

  return (
    <div className="space-y-4">
      <form action={action} data-no-toast className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Konto</label>
          <select name="accountId" className="input" required defaultValue="">
            <option value="" disabled>
              Konto wählen…
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Format</label>
          <select name="format" className="input" defaultValue="">
            <option value="">automatisch erkennen</option>
            <option value="csv">CSV</option>
            <option value="camt">CAMT.053 (XML)</option>
            <option value="mt940">MT940 (.sta)</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Datei</label>
          <input
            name="file"
            type="file"
            accept=".csv,.xml,.txt,.sta,.mt940"
            className="input file:mr-3 file:rounded file:border-0 file:bg-brand file:px-3 file:py-1 file:text-white"
            required
          />
          <p className="mt-1 text-xs text-slate-400">
            Kontoauszug aus dem Online-Banking exportieren (CSV, CAMT.053 oder MT940). Doppelte
            Buchungen werden automatisch erkannt und übersprungen.
          </p>
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Importiere…" : "Importieren"}
          </button>
        </div>
      </form>

      {state?.error && (
        <div className="card border-red-200 bg-red-50 text-sm text-red-700">{state.error}</div>
      )}

      {state?.imported != null && (
        <div className="card border-emerald-200 bg-emerald-50">
          <div className="text-sm text-emerald-800">
            <strong>Import abgeschlossen</strong> ({state.format?.toUpperCase()})
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-sm text-slate-700 sm:grid-cols-4">
            <li>Erkannt: <strong>{state.parsed}</strong></li>
            <li>Importiert: <strong className="text-emerald-700">{state.imported}</strong></li>
            <li>Duplikate: <strong>{state.duplicates}</strong></li>
            <li>Kategorisiert: <strong>{state.categorized}</strong></li>
          </ul>
        </div>
      )}

      {state?.warnings && state.warnings.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 text-xs text-amber-800">
          <div className="mb-1 font-semibold">Hinweise:</div>
          <ul className="list-inside list-disc space-y-0.5">
            {state.warnings.slice(0, 10).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {state.warnings.length > 10 && <li>… und {state.warnings.length - 10} weitere.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
