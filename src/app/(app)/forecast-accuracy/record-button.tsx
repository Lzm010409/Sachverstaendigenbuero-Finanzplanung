"use client";

import { useState, useTransition } from "react";
import { recordSnapshotNow } from "@/app/actions/snapshots";

export function RecordSnapshotButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn-secondary" disabled={pending} onClick={() => start(async () => setMsg((await recordSnapshotNow()).message))}>
        {pending ? "Speichere…" : "Aktuellen Snapshot festhalten"}
      </button>
      {msg && <span className="text-sm text-emerald-600">{msg}</span>}
    </div>
  );
}
