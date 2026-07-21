"use client";

import { useState, useTransition } from "react";
import { syncSevdesk, type SevdeskSyncResult } from "@/app/actions/settings";

export function SevdeskSync() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SevdeskSyncResult | null>(null);

  return (
    <div className="space-y-2">
      <button
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(await syncSevdesk());
          })
        }
      >
        {pending ? "Synchronisiere…" : "Jetzt synchronisieren"}
      </button>
      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
      {result && !result.error && (
        <p className="text-sm text-emerald-700">
          {result.accounts} Konten geprüft, {result.imported} neue Umsätze importiert (
          {result.categorized} kategorisiert).
        </p>
      )}
    </div>
  );
}
