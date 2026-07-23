import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { logout } from "@/app/actions/auth";
import { NavLink } from "@/components/nav-link";
import { NavGroup } from "@/components/nav-group";
import { MobileNav } from "@/components/mobile-nav";
import { GlobalPending } from "@/components/global-pending";

// Startseite bleibt einzeln oben; alle übrigen Punkte sind in aufklappbaren
// Bereichen gebündelt, damit die Seitenleiste kurz bleibt.
const HOME = { href: "/", label: "Übersicht", icon: "📊" };

const NAV_GROUPS: { label: string; items: { href: string; label: string; icon: string }[] }[] = [
  {
    label: "Liquidität",
    items: [
      { href: "/forecast", label: "13-Wochen-Vorschau", icon: "🔮" },
      { href: "/calendar", label: "Fälligkeitskalender", icon: "📅" },
      { href: "/planning", label: "Planung", icon: "🗓️" },
      { href: "/scenarios", label: "Szenarien", icon: "🎚️" },
      { href: "/scenario-compare", label: "Szenario-Vergleich", icon: "⚖️" },
    ],
  },
  {
    label: "Forderungen & Posten",
    items: [
      { href: "/open-items", label: "Offene Posten", icon: "🧾" },
      { href: "/receivables", label: "Forderungen", icon: "📬" },
    ],
  },
  {
    label: "Buchhaltung",
    items: [
      { href: "/transactions", label: "Umsätze", icon: "💶" },
      { href: "/categories", label: "Kategorien", icon: "🏷️" },
      { href: "/budgets", label: "Budgets", icon: "💰" },
      { href: "/import", label: "Import", icon: "📥" },
      { href: "/accounts", label: "Konten", icon: "🏦" },
    ],
  },
  {
    label: "Auswertung & Berichte",
    items: [
      { href: "/breakdown", label: "Auswertung", icon: "📈" },
      { href: "/plan-actual", label: "Plan/Ist", icon: "📐" },
      { href: "/plan-check", label: "Planungs-Check", icon: "🧷" },
      { href: "/tax", label: "Steuer-Vorschau", icon: "🧮" },
      { href: "/concentration", label: "Klumpenrisiko", icon: "🎯" },
      { href: "/forecast-accuracy", label: "Prognose-Güte", icon: "📉" },
      { href: "/report", label: "Bericht", icon: "📄" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/notifications", label: "Benachrichtigungen", icon: "🔔" },
      { href: "/contacts", label: "Kontakte", icon: "👥" },
      { href: "/settings", label: "Einstellungen", icon: "⚙️" },
      { href: "/diagnostics", label: "Selbsttest", icon: "🩺" },
    ],
  },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div className="flex min-h-screen">
      <GlobalPending />
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <Link href="/" className="mb-6 px-2 text-lg font-bold text-brand-fg">
          Liquiditäts&shy;planung
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          <NavLink href={HOME.href} icon={HOME.icon} label={HOME.label} />
          {NAV_GROUPS.map((g) => (
            <NavGroup key={g.label} label={g.label} items={g.items} />
          ))}
        </nav>
        <form action={logout} className="mt-2">
          <button type="submit" className="btn-secondary w-full text-slate-500">
            Abmelden
          </button>
        </form>
      </aside>
      <div className="min-w-0 flex-1">
        <MobileNav home={HOME} groups={NAV_GROUPS} />
        <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
