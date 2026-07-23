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
// entprellt (350 ms) bzw. mit Enter. Soft-Navigation via router.push; bestehende
// Nicht-Filter-Parameter (z.B. size) bleiben erhalten, `page` wird verworfen
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
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submit = () => {
    const form = ref.current;
    if (!form) return;
    const fd = new FormData(form);
    // Navigation: bestehende Parameter übernehmen, page verwerfen, Filterfelder setzen.
    const nav = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    nav.delete("page");
    const filt = new URLSearchParams();
    for (const key of new Set(fd.keys())) {
      const v = String(fd.get(key) ?? "").trim();
      if (v) {
        nav.set(key, v);
        filt.set(key, v);
      } else {
        nav.delete(key);
      }
    }
    const filtStr = filt.toString();
    try {
      if (filtStr) localStorage.setItem(`flt:${pageKey}`, filtStr);
      else localStorage.removeItem(`flt:${pageKey}`);
    } catch {
      /* ignorieren */
    }
    const navStr = nav.toString();
    router.push(navStr ? `${pathname}?${navStr}` : pathname);
  };

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        submit();
      }}
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
