"use client";

import { useActionState } from "react";
import { importFinban, type FinbanImportSummary } from "@/app/actions/import-finban";

export function FinbanForm() {
  const [state, action, pending] = useActionState(
    async (_p: FinbanImportSummary, fd: FormData) => importFinban(fd),
    {},
  );

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <div>
          <label className="label">finban-Export (CSV)</label>
          <input
            name="file"
            type="file"
            accept=".csv,.txt"
            required
            className="input file:mr-3 file:rounded file:border-0 file:bg-brand file:px-3 file:py-1 file:text-white"
          />
          <p className="mt-1 text-xs text-slate-400">
            Transaktionsexport aus finban (Spalten: Datum, Titel, Wert, …, Status, Kategorie).
            Konten, Kategorien und geplante Posten werden automatisch angelegt.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="replace" className="h-4 w-4 rounded border-slate-300" />
          Bestehende Daten (inkl. Demo-Daten) vorher <strong>ersetzen</strong>
        </label>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Importiere…" : "finban importieren"}
        </button>
      </form>

      {state?.error && (
        <div className="card border-red-200 bg-red-50 text-sm text-red-700">{state.error}</div>
      )}

      {state?.transactions != null && (
        <div className="card border-emerald-200 bg-emerald-50">
          <div className="text-sm font-semibold text-emerald-800">
            Import abgeschlossen{state.replaced ? " (Daten ersetzt)" : ""}
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-sm text-slate-700 sm:grid-cols-3">
            <li>Erkannt: <strong>{state.parsed}</strong></li>
            <li>Konten: <strong>{state.accounts}</strong></li>
            <li>Kategorien: <strong>{state.categories}</strong></li>
            <li>Umsätze: <strong className="text-emerald-700">{state.transactions}</strong></li>
            <li>Planposten: <strong>{state.planned}</strong></li>
            <li>Duplikate: <strong>{state.duplicates}</strong></li>
          </ul>
        </div>
      )}

      {state?.warnings && state.warnings.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 text-xs text-amber-800">
          <div className="mb-1 font-semibold">Hinweise ({state.warnings.length}):</div>
          <ul className="list-inside list-disc space-y-0.5">
            {state.warnings.slice(0, 8).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {state.warnings.length > 8 && <li>… und {state.warnings.length - 8} weitere.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
