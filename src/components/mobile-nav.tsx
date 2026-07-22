"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavLink } from "./nav-link";
import { NavGroup, type NavItem } from "./nav-group";
import { logout } from "@/app/actions/auth";

// Mobile-Navigation: schlanke Kopfzeile mit Hamburger-Button, der eine
// Schublade (Drawer) mit derselben gruppierten Navigation öffnet. Schließt
// automatisch bei Seitenwechsel und sperrt das Hintergrund-Scrollen.
export function MobileNav({
  home,
  groups,
}: {
  home: NavItem;
  groups: { label: string; items: NavItem[] }[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <Link href="/" className="text-base font-bold text-brand-fg">
          Liquiditäts&shy;planung
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menü öffnen"
          className="btn-secondary px-3 py-1.5"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <nav className="absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col overflow-y-auto bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-brand-fg">Menü</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Menü schließen"
                className="-mr-1 flex h-8 w-8 items-center justify-center rounded text-2xl leading-none text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-0.5">
              <NavLink href={home.href} icon={home.icon} label={home.label} />
              {groups.map((g) => (
                <NavGroup key={g.label} label={g.label} items={g.items} />
              ))}
            </div>
            <form action={logout} className="mt-2">
              <button type="submit" className="btn-secondary w-full text-slate-500">
                Abmelden
              </button>
            </form>
          </nav>
        </div>
      )}
    </>
  );
}
