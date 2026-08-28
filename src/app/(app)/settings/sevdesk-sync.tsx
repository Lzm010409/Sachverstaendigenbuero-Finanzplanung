"use client";

import { useState, useTransition } from "react";
import {
  syncSevdesk,
  syncSevdeskDocuments,
  type SevdeskDocsResult,
  type SevdeskSyncResult,
} from "@/app/actions/settings";
import { notify } from "@/components/action-toaster";

export function SevdeskSync() {
  const [pending, start] = useTransition();
  const [txResult, setTxResult] = useState<SevdeskSyncResult | null>(null);
  const [docResult, setDocResult] = useState<SevdeskDocsResult | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn-primary"
          disabled={pending}
          onClick={() => {
            notify("Umsätze werden synchronisiert…");
            start(async () => {
              const r = await syncSevdesk();
              setTxResult(r);
              notify(r.error ? r.error : `${r.imported ?? 0} neue Umsätze synchronisiert`, r.error ? "error" : "success");
            });
          }}
        >
          {pending ? "…" : "Umsätze synchronisieren"}
        </button>
        <button
          className="btn-secondary"
          disabled={pending}
          onClick={() => {
            notify("Rechnungen & Belege werden synchronisiert…");
            start(async () => {
              const r = await syncSevdeskDocuments();
              setDocResult(r);
              notify(r.error ? r.error : "Rechnungen & Belege synchronisiert", r.error ? "error" : "success");
            });
          }}
        >
          {pending ? "…" : "Rechnungen & Belege synchronisieren"}
        </button>
      </div>

      {txResult?.error && <p className="text-sm text-red-600">{txResult.error}</p>}
      {txResult && !txResult.error && (
        <p className="text-sm text-emerald-700">
          {txResult.accounts} Konten geprüft, {txResult.imported} neue Umsätze (
          {txResult.categorized} kategorisiert), {txResult.reconciled ?? 0} Salden abgeglichen.
        </p>
      )}
      {docResult?.error && <p className="text-sm text-red-600">{docResult.error}</p>}
      {docResult && !docResult.error && (
        <p className="text-sm text-emerald-700">
          {docResult.receivables} offene Forderungen, {docResult.payables} Verbindlichkeiten
          importiert, {docResult.closed ?? 0} als bezahlt markiert.
        </p>
      )}
    </div>
  );
}
