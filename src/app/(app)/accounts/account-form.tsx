"use client";

import { useActionState, useEffect, useRef } from "react";
import { createAccount } from "@/app/actions/accounts";
import { useActionToast } from "@/components/action-toaster";

export function AccountForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string; ok?: boolean }, fd: FormData) => createAccount(fd),
    {},
  );

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  useActionToast(state, "Konto angelegt");

  return (
    <form ref={formRef} action={action} data-no-toast className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Kontoname</label>
        <input name="name" className="input" placeholder="z.B. Geschäftskonto Sparkasse" required />
      </div>
      <div>
        <label className="label">Typ</label>
        <select name="type" className="input" defaultValue="CHECKING">
          <option value="CHECKING">Girokonto</option>
          <option value="SAVINGS">Sparkonto / Tagesgeld</option>
          <option value="CASH">Kasse</option>
          <option value="CREDIT">Kreditkarte / Kreditlinie</option>
        </select>
      </div>
      <div>
        <label className="label">IBAN (optional)</label>
        <input name="iban" className="input" placeholder="DE.." />
      </div>
      <div>
        <label className="label">Anfangssaldo (€)</label>
        <input name="openingBalance" className="input" placeholder="0,00" inputMode="decimal" />
      </div>
      <div>
        <label className="label">Saldo-Stichtag</label>
        <input name="openingDate" type="date" className="input" />
      </div>
      {state?.error && <p className="text-sm text-red-600 sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Speichern…" : "Konto anlegen"}
        </button>
      </div>
    </form>
  );
}
