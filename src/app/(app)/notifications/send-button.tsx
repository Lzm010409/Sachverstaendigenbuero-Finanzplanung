"use client";

import { useState, useTransition } from "react";
import { sendDigestNow } from "@/app/actions/notifications";

export function SendDigestButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className="btn-primary"
        disabled={pending}
        onClick={() => start(async () => {
          const r = await sendDigestNow();
          setMsg({ ok: r.ok, text: r.message });
        })}
      >
        {pending ? "Sende…" : "Digest jetzt per E-Mail senden"}
      </button>
      {msg && <span className={`text-sm ${msg.ok ? "text-emerald-600" : "text-amber-600"}`}>{msg.text}</span>}
    </div>
  );
}
