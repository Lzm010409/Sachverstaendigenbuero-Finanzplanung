"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function NavLink({
  href,
  label,
  icon,
  compact = false,
}: {
  href: string;
  label: string;
  icon: string;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
        active ? "bg-brand/10 text-brand-fg" : "text-slate-600 hover:bg-slate-100",
        compact && "whitespace-nowrap",
      )}
    >
      <span aria-hidden>{icon}</span>
      <span className={compact ? "hidden sm:inline" : ""}>{label}</span>
    </Link>
  );
}
