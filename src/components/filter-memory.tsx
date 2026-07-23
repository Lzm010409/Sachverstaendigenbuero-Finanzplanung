"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Stellt einen gemerkten Filter automatisch wieder her, wenn die Seite OHNE
// jegliche Query-Parameter aufgerufen wird (frischer Aufruf über die Navigation).
// Speichern übernimmt ausschließlich die AutoFilterForm bzw. ClearFiltersLink –
// so gibt es genau einen Schreiber und keine Konflikte.
export function FilterMemory({ pageKey }: { pageKey: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const search = sp.toString();

  useEffect(() => {
    if (search !== "") return; // nur beim wirklich nackten Aufruf wiederherstellen
    try {
      const saved = localStorage.getItem(`flt:${pageKey}`);
      if (saved) router.replace(`${pathname}?${saved}`);
    } catch {
      /* localStorage nicht verfügbar */
    }
  }, [search, pathname, pageKey, router]);

  return null;
}

// Formular, das automatisch filtert: Selects lösen sofort aus, Textfelder
// entprellt (350 ms) bzw. mit Enter. Nutzt eine NATIVE GET-Absendung (wie ein
// klassisches Filter-Formular, nur ohne Button) – das rendert die Seite
// zuverlässig gefiltert neu (reine router.push-Query-Änderungen tun das nicht
// immer). `size` wird über ein verstecktes Feld erhalten, `page` fällt weg
// (zurück auf Seite 1). Der reine Filter-Zustand wird je Seite gemerkt.
export function AutoFilterForm({
  pageKey,
  className,
  children,
}: {
  pageKey: string;
  className?: string;
  children: React.ReactNode;
}) {
  const sp = useSearchParams();
  const size = sp.get("size");
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filterzustand (ohne size) merken, dann nativ absenden.
  const submit = () => {
    const form = ref.current;
    if (!form) return;
    try {
      const fd = new FormData(form);
      const filt = new URLSearchParams();
      for (const key of new Set(fd.keys())) {
        if (key === "size") continue;
        const v = String(fd.get(key) ?? "").trim();
        if (v) filt.set(key, v);
      }
      const s = filt.toString();
      if (s) localStorage.setItem(`flt:${pageKey}`, s);
      else localStorage.removeItem(`flt:${pageKey}`);
    } catch {
      /* ignorieren */
    }
    form.requestSubmit();
  };

  return (
    <form
      ref={ref}
      method="get"
      className={className}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        if (t.tagName === "SELECT") {
          if (timer.current) clearTimeout(timer.current);
          submit();
        }
      }}
      onInput={(e) => {
        const t = e.target as HTMLInputElement;
        if (t.tagName === "INPUT" && ["text", "search", ""].includes(t.type)) {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(submit, 350);
        }
      }}
    >
      {size && <input type="hidden" name="size" value={size} />}
      {children}
    </form>
  );
}

// „Zurücksetzen": löscht den gemerkten Filter dieser Seite und navigiert auf den
// nackten Pfad (danach wird nichts wiederhergestellt).
export function ClearFiltersLink({
  pageKey,
  basePath,
  className,
  children,
}: {
  pageKey: string;
  basePath: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        try {
          localStorage.removeItem(`flt:${pageKey}`);
        } catch {
          /* ignorieren */
        }
        router.push(basePath);
      }}
    >
      {children}
    </button>
  );
}
