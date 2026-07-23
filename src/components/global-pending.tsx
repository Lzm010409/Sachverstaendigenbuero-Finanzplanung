"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Globaler Lade-/Submit-Indikator. Zeigt einen Fortschrittsbalken (oben) und
// einen kleinen Spinner an, sobald
//  - ein interner Link angeklickt wird (Navigation), oder
//  - irgendein Formular abgeschickt wird (Server-Action / GET-Filter).
// Beendet wird er, wenn die Navigation abgeschlossen ist (Pfad/Query ändern sich)
// ODER die Seite nach einer Server-Action „zur Ruhe kommt" (MutationObserver mit
// Nachlauf) – plus ein Sicherheits-Cap, damit er nie hängen bleibt.
export function GlobalPending() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [active, setActive] = useState(false);

  const cap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const obs = useRef<MutationObserver | null>(null);

  const stop = () => {
    setActive(false);
    if (cap.current) clearTimeout(cap.current);
    if (settle.current) clearTimeout(settle.current);
    obs.current?.disconnect();
    obs.current = null;
  };

  const start = () => {
    setActive(true);
    if (cap.current) clearTimeout(cap.current);
    cap.current = setTimeout(stop, 12000); // Sicherheits-Cap
    // „Seite ruhig" -> fertig: 700 ms ohne DOM-Änderung nach dem Auslösen.
    obs.current?.disconnect();
    const o = new MutationObserver(() => {
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(stop, 700);
    });
    o.observe(document.body, { childList: true, subtree: true });
    obs.current = o;
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
    const onSubmit = () => start();
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigation fertig (Pfad/Query geändert) -> kurz nachlaufen, dann stoppen.
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(stop, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search]);

  if (!active) return null;

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden bg-brand/15">
        <div className="jd-progress-bar h-full w-full" />
      </div>
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-lg"
      >
        <span className="jd-spinner h-3.5 w-3.5" />
        Lädt…
      </div>
    </>
  );
}
