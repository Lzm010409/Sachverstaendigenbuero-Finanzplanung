"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { NavLink } from "./nav-link";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

// Aufklappbarer Navigations-Bereich. Der Bereich mit der aktiven Seite ist
// standardmäßig geöffnet; die übrigen bleiben eingeklappt – so bleibt die
// Seitenleiste kurz.
export function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();
  const containsActive = items.some((i) =>
    i.href === "/" ? pathname === "/" : pathname.startsWith(i.href),
  );
  const [open, setOpen] = useState(containsActive);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600"
      >
        <span>{label}</span>
        <span className={`text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
      </button>
      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {items.map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} />
          ))}
        </div>
      )}
    </div>
  );
}
