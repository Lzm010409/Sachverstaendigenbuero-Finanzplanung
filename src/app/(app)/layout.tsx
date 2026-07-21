import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { logout } from "@/app/actions/auth";
import { NavLink } from "@/components/nav-link";

const NAV = [
  { href: "/", label: "Übersicht", icon: "📊" },
  { href: "/transactions", label: "Umsätze", icon: "💶" },
  { href: "/import", label: "Import", icon: "📥" },
  { href: "/planning", label: "Planung", icon: "🗓️" },
  { href: "/categories", label: "Kategorien", icon: "🏷️" },
  { href: "/accounts", label: "Konten", icon: "🏦" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <Link href="/" className="mb-6 px-2 text-lg font-bold text-brand-fg">
          Liquiditäts&shy;planung
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} />
          ))}
        </nav>
        <form action={logout}>
          <button type="submit" className="btn-secondary w-full text-slate-500">
            Abmelden
          </button>
        </form>
      </aside>
      <div className="flex-1">
        <header className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden">
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} compact />
          ))}
        </header>
        <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
