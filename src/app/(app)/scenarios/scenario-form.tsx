"use client";

import { useActionState, useEffect, useRef } from "react";
import { createScenario } from "@/app/actions/scenarios";
import { useActionToast } from "@/components/action-toaster";

export function ScenarioForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (_p: { error?: string; ok?: boolean }, fd: FormData) => createScenario(fd),
    {},
  );
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  useActionToast(state, "Szenario gespeichert");

  return (
    <form ref={ref} action={action} data-no-toast className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="lg:col-span-1">
        <label className="label">Name</label>
        <input name="name" className="input" placeholder="z.B. Worst Case" required />
      </div>
      <div>
        <label className="label">Zufluss-Faktor</label>
        <input name="inflowFactor" className="input" placeholder="1,0" inputMode="decimal" defaultValue="1,0" />
        <p className="mt-1 text-xs text-slate-400">0,8 = 20 % weniger Einnahmen</p>
      </div>
      <div>
        <label className="label">Abfluss-Faktor</label>
        <input name="outflowFactor" className="input" placeholder="1,0" inputMode="decimal" defaultValue="1,0" />
        <p className="mt-1 text-xs text-slate-400">1,1 = 10 % mehr Ausgaben</p>
      </div>
      <div>
        <label className="label">Zahlungsverzug (Tage)</label>
        <input name="inflowShiftDays" type="number" min={0} className="input" defaultValue={0} />
        <p className="mt-1 text-xs text-slate-400">Einnahmen kommen n Tage später</p>
      </div>
      {state?.error && (
        <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-4">{state.error}</p>
      )}
      <div className="sm:col-span-2 lg:col-span-4">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Speichern…" : "Szenario anlegen"}
        </button>
      </div>
    </form>
  );
}
