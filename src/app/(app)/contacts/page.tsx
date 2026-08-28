import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { Pagination, clampPageSize } from "@/components/pagination";
import { FilterMemory, AutoFilterForm } from "@/components/filter-memory";
import { SortableTh } from "@/components/sortable-th";

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; size?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const PAGE_SIZE = clampPageSize(sp.size);
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const sortMap: Record<string, Prisma.ContactOrderByWithRelationInput> = {
    name: { name: dir },
    type: { type: dir },
    orgName: { orgName: dir },
    email: { email: dir },
  };
  const orderBy: Prisma.ContactOrderByWithRelationInput =
    sp.sort && sortMap[sp.sort] ? sortMap[sp.sort] : { name: "asc" };
  const where: Prisma.ContactWhereInput = sp.q
    ? {
        OR: [
          { name: { contains: sp.q, mode: "insensitive" } },
          { orgName: { contains: sp.q, mode: "insensitive" } },
          { email: { contains: sp.q, mode: "insensitive" } },
        ],
      }
    : {};

  const [contacts, matchCount, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.contact.count({ where }),
    prisma.contact.count(),
  ]);
  const totalPages = Math.ceil(matchCount / PAGE_SIZE);
  const sizeParam = PAGE_SIZE !== 50 ? String(PAGE_SIZE) : undefined;
  // Für Sortier-Köpfe: Filter beibehalten (sort/dir setzt SortableTh selbst).
  const sortFilterParams = { q: sp.q, size: sizeParam };
  // Für Pagination: Filter + aktive Sortierung beibehalten.
  const pageParams = { q: sp.q, size: sizeParam, sort: sp.sort, dir: sp.dir };

  return (
    <div className="space-y-6">
      <FilterMemory pageKey="/contacts" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Kontakte</h1>
        <span className="text-sm text-slate-500">{total} aus Pipedrive</span>
      </div>

      <AutoFilterForm pageKey="/contacts" className="card flex items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="label">Suche</label>
          <input name="q" defaultValue={sp.q ?? ""} className="input" placeholder="Name, Organisation, E-Mail" />
        </div>
      </AutoFilterForm>

      <div className="card">
        {total === 0 ? (
          <p className="text-sm text-slate-400">
            Noch keine Kontakte. Synchronisiere sie unter <strong>Einstellungen → Pipedrive</strong>.
          </p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-slate-400">Keine Treffer.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <SortableTh col="name" label="Name" sort={sp.sort ?? ""} dir={dir} basePath="/contacts" params={sortFilterParams} />
                    <SortableTh col="type" label="Typ" sort={sp.sort ?? ""} dir={dir} basePath="/contacts" params={sortFilterParams} />
                    <SortableTh col="orgName" label="Organisation" sort={sp.sort ?? ""} dir={dir} basePath="/contacts" params={sortFilterParams} />
                    <SortableTh col="email" label="E-Mail" sort={sp.sort ?? ""} dir={dir} basePath="/contacts" params={sortFilterParams} />
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
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={matchCount}
              pageSize={PAGE_SIZE}
              basePath="/contacts"
              params={pageParams}
            />
          </>
        )}
      </div>
    </div>
  );
}
