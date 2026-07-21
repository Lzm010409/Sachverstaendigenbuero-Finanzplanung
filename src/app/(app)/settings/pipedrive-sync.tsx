"use client";

import { useState, useTransition } from "react";
import { syncPipedrive, type PipedriveSyncResult } from "@/app/actions/settings";

export function PipedriveSync() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PipedriveSyncResult | null>(null);

  return (
    <div className="space-y-2">
      <button
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(await syncPipedrive());
          })
        }
      >
        {pending ? "Synchronisiere…" : "Kontakte synchronisieren"}
      </button>
      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
      {result && !result.error && (
        <p className="text-sm text-emerald-700">
          {result.persons} Personen und {result.organizations} Organisationen synchronisiert (
          {result.total} Kontakte).
        </p>
      )}
    </div>
  );
}
