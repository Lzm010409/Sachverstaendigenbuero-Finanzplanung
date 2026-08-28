"use client";

import { useActionState } from "react";
import { microsoftLogin, passwordLogin } from "@/app/actions/auth";

export function LoginForm({
  microsoftEnabled,
  callbackUrl = "/",
}: {
  microsoftEnabled: boolean;
  callbackUrl?: string;
}) {
  const [state, formAction, pending] = useActionState(passwordLogin, {});

  return (
    <div className="space-y-4">
      {microsoftEnabled && (
        <>
          <form action={microsoftLogin.bind(null, callbackUrl)}>
            <button type="submit" className="btn-secondary w-full">
              <span aria-hidden>🔐</span> Mit Microsoft anmelden
            </button>
          </form>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            oder Passwort
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div>
          <label className="label" htmlFor="password">
            Passwort
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoFocus={!microsoftEnabled}
            className="input"
            placeholder="••••••••"
          />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "Anmelden…" : "Anmelden"}
        </button>
      </form>
    </div>
  );
}
