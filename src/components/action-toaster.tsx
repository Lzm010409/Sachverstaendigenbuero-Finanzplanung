"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Zeigt bei einer `useActionState`-Aktion eine präzise Erfolgsmeldung, sobald sie
 * wirklich erfolgreich war (state.ok). Fehler bleiben der Inline-Anzeige des
 * Formulars überlassen. Solche Formulare sollten zusätzlich `data-no-toast`
 * tragen, damit nicht zusätzlich der optimistische Sammel-Toast erscheint.
 */
export function useActionToast(
  state: { ok?: boolean; error?: string } | undefined,
  okMessage: string,
) {
  const prev = useRef(state);
  useEffect(() => {
    if (state !== prev.current && state?.ok) notify(okMessage);
    prev.current = state;
  }, [state, okMessage]);
}

// Globales Feedback für Interaktionen. Vereint zwei Dinge:
//  1. Einen Fortschrittsbalken oben + Nachlauf-Logik (wie zuvor GlobalPending)
//     für Navigation UND Formular-Absendungen.
//  2. Toast-Meldungen unten rechts, die dem Nutzer bestätigen, dass eine Aktion
//     ausgelöst wurde: „Wird ausgeführt…" -> „Erledigt ✓".
//
// Die Toasts erscheinen AUTOMATISCH bei jeder Server-Action (Formular ohne
// explizites method="get"). Reine GET-Filter (AutoFilterForm, Perioden-Auswahl)
// lösen bewusst keinen Toast aus – nur den Balken. Einzelne Formulare können die
// Erfolgsmeldung über `data-toast="…"` anpassen oder per `data-no-toast` ganz
// abschalten. Client-Aktionen ohne Formular (z. B. fetch) können über das Event
// `app:toast` bzw. die Hilfsfunktion `notify()` eine Meldung auslösen.

type Kind = "pending" | "success" | "error";
type Toast = { id: number; kind: Kind; msg: string };

/** Löst von überall im Client eine Toast-Meldung aus. */
export function notify(message: string, kind: "success" | "error" = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("app:toast", { detail: { message, kind } }));
}

export function ActionToaster() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [bar, setBar] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const idRef = useRef(0);
  const cap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const obs = useRef<MutationObserver | null>(null);
  // Ausstehende Toasts -> ihre Erfolgsmeldung (bis „Seite zur Ruhe kommt").
  const pending = useRef<Map<number, string>>(new Map());

  const remove = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const resolveOne = (id: number) => {
    const msg = pending.current.get(id);
    if (msg == null) return;
    pending.current.delete(id);
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, kind: "success", msg } : t)));
    setTimeout(() => remove(id), 2400);
  };
  const resolveAll = () => {
    for (const id of [...pending.current.keys()]) resolveOne(id);
  };

  const stop = () => {
    setBar(false);
    if (cap.current) clearTimeout(cap.current);
    if (settle.current) clearTimeout(settle.current);
    obs.current?.disconnect();
    obs.current = null;
    resolveAll();
  };

  const start = () => {
    setBar(true);
    if (cap.current) clearTimeout(cap.current);
    cap.current = setTimeout(stop, 12000); // Sicherheits-Cap
    obs.current?.disconnect();
    const o = new MutationObserver(() => {
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(stop, 700); // 700 ms ohne DOM-Änderung = fertig
    });
    o.observe(document.body, { childList: true, subtree: true });
    obs.current = o;
  };

  const pushToast = (kind: Kind, msg: string, successMsg?: string) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, kind, msg }]);
    if (kind === "pending") {
      pending.current.set(id, successMsg ?? "Erledigt ✓");
      // Sicherheitsnetz: falls die Seite keine DOM-Änderung auslöst.
      setTimeout(() => resolveOne(id), 6000);
    } else {
      setTimeout(() => remove(id), 2400);
    }
    return id;
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest?.("a");
      if (!a) return;
      if (a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      try {
        const url = new URL(a.href, location.href);
        if (url.origin !== location.origin) return;
        if (url.pathname === location.pathname && url.search === location.search) return;
      } catch {
        return;
      }
      start();
    };
    const onSubmit = (e: Event) => {
      start();
      const form = e.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;
      // Reine GET-Formulare (Filter/Perioden) bestätigen wir nicht per Toast.
      const method = form.getAttribute("method");
      if (method && method.toLowerCase() === "get") return;
      if (form.dataset.noToast != null) return;
      pushToast("pending", form.dataset.toastPending || "Wird ausgeführt…", form.dataset.toast || "Erledigt ✓");
    };
    const onNotify = (e: Event) => {
      const d = (e as CustomEvent).detail as { message?: string; kind?: "success" | "error" } | undefined;
      if (!d?.message) return;
      pushToast(d.kind === "error" ? "error" : "success", d.message);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("app:toast", onNotify as EventListener);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("app:toast", onNotify as EventListener);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigation abgeschlossen (Pfad/Query geändert) -> kurz nachlaufen, dann stoppen.
  useEffect(() => {
    if (!bar) return;
    const t = setTimeout(stop, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search]);

  return (
    <>
      {bar && (
        <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden bg-brand/15 print:hidden">
          <div className="jd-progress-bar h-full w-full" />
        </div>
      )}
      {toasts.length > 0 && (
        <div className="fixed right-4 top-4 z-[100] flex flex-col items-end gap-2.5 print:hidden">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              aria-live="polite"
              className={`flex items-center gap-2.5 rounded-full border px-5 py-3 text-sm font-medium shadow-lg transition ${
                t.kind === "pending"
                  ? "border-slate-200 bg-white text-slate-600"
                  : t.kind === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {t.kind === "pending" ? (
                <span className="jd-spinner h-4 w-4" />
              ) : (
                <span aria-hidden className="text-base leading-none">{t.kind === "error" ? "⛔" : "✓"}</span>
              )}
              {t.msg}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
