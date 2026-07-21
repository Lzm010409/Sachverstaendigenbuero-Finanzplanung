import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const where: Prisma.ContactWhereInput = sp.q
    ? {
        OR: [
          { name: { contains: sp.q, mode: "insensitive" } },
          { orgName: { contains: sp.q, mode: "insensitive" } },
          { email: { contains: sp.q, mode: "insensitive" } },
        ],
      }
    : {};

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({ where, orderBy: { name: "asc" }, take: 200 }),
    prisma.contact.count(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Kontakte</h1>
        <span className="text-sm text-slate-500">{total} aus Pipedrive</span>
      </div>

      <form className="card flex items-end gap-3" method="get">
        <div className="min-w-[220px] flex-1">
          <label className="label">Suche</label>
          <input name="q" defaultValue={sp.q ?? ""} className="input" placeholder="Name, Organisation, E-Mail" />
        </div>
        <button className="btn-secondary" type="submit">
          Suchen
        </button>
      </form>

      <div className="card">
        {total === 0 ? (
          <p className="text-sm text-slate-400">
            Noch keine Kontakte. Synchronisiere sie unter <strong>Einstellungen → Pipedrive</strong>.
          </p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-slate-400">Keine Treffer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="th">Name</th>
                  <th className="th">Typ</th>
                  <th className="th">Organisation</th>
                  <th className="th">E-Mail</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50">
                    <td className="td font-medium">{c.name}</td>
                    <td className="td">
                      <span
                        className={`badge ${c.type === "ORG" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}
                      >
                        {c.type === "ORG" ? "Organisation" : "Person"}
                      </span>
                    </td>
                    <td className="td text-slate-600">{c.orgName ?? "—"}</td>
                    <td className="td text-slate-600">{c.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {contacts.length === 200 && (
              <p className="mt-3 text-xs text-slate-400">Erste 200 angezeigt – nutze die Suche.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
