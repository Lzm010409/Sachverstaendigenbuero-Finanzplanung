import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { startOfDayUTC, todayUTC } from "@/lib/dates";
import { Pagination, clampPageSize } from "@/components/pagination";
import { FilterMemory, ClearFiltersLink, AutoFilterForm } from "@/components/filter-memory";
import { CategoryOptions } from "@/components/category-select";
import { SortableTh } from "@/components/sortable-th";
import { PlannedForm } from "./planned-form";
import { PlannedRow } from "./planned-row";

export const dynamic = "force-dynamic";

const RECURRENCES = ["ONCE", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
const RHYTHM_OPT: Record<(typeof RECURRENCES)[number], string> = {
  ONCE: "einmalig",
  WEEKLY: "wöchentlich",
  MONTHLY: "monatlich",
  QUARTERLY: "quartalsweise",
  YEARLY: "jährlich",
};

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; dir?: string; rec?: string; state?: string; q?: string; page?: string; size?: string; sort?: string; sdir?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = clampPageSize(sp.size);
  const today = startOfDayUTC(todayUTC());

  // Sortierung: eigener Richtungs-Parameter `sdir`, da `dir` hier den
  // Richtungsfilter (Ein-/Auszahlung) belegt.
  const sdir: "asc" | "desc" = sp.sdir === "desc" ? "desc" : "asc";
  const sortMap: Record<string, Prisma.PlannedItemOrderByWithRelationInput> = {
    name: { name: sdir },
    recurrence: { recurrence: sdir },
    startDate: { startDate: sdir },
    endDate: { endDate: sdir },
    amount: { amount: sdir },
  };

  // Filter → WHERE
  const where: Prisma.PlannedItemWhereInput = {};
  if (sp.cat === "none") where.categoryId = null;
  else if (sp.cat) where.categoryId = sp.cat;
  if (sp.dir === "in") where.amount = { gt: 0 };
  else if (sp.dir === "out") where.amount = { lt: 0 };
  if (sp.rec && (RECURRENCES as readonly string[]).includes(sp.rec)) {
    where.recurrence = sp.rec as (typeof RECURRENCES)[number];
  }
  if (sp.state === "active") where.active = true;
  else if (sp.state === "inactive") where.active = false;
  else if (sp.state === "expired") where.endDate = { lt: today }; // Enddatum in der Vergangenheit
  if (sp.q) where.name = { contains: sp.q, mode: "insensitive" };

  const [items, totalCount, categories] = await Promise.all([
    prisma.plannedItem.findMany({
      where,
      orderBy: sp.sort && sortMap[sp.sort] ? [sortMap[sp.sort]] : [{ active: "desc" }, { startDate: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { category: true },
    }),
    prisma.plannedItem.count({ where }),
    prisma.category.findMany({ where: { deletedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
  ]);

  const pages = Math.ceil(totalCount / pageSize);
  const catOptions = categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }));
  const hasFilter = !!(sp.cat || sp.dir || sp.rec || sp.state || sp.q);
  const sizeParam = pageSize !== 50 ? String(pageSize) : undefined;
  const filterParams = { cat: sp.cat, dir: sp.dir, rec: sp.rec, state: sp.state, q: sp.q, size: sizeParam };
  const pageParams = { ...filterParams, sort: sp.sort, sdir: sp.sdir };

  return (
    <div className="space-y-6">
      <FilterMemory pageKey="/planning" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Planung</h1>
        <span className="text-sm text-slate-500">{totalCount} Planposten</span>
      </div>
      <p className="-mt-4 text-sm text-slate-500">
        Wiederkehrende und einmalige Ein-/Auszahlungen fließen in die Liquiditätsvorschau ein.
      </p>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Neuer Planposten</h2>
        <PlannedForm categories={catOptions} />
      </div>

      <AutoFilterForm pageKey="/planning" className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Kategorie</label>
          <select name="cat" defaultValue={sp.cat ?? ""} className="input w-auto">
            <option value="">alle</option>
            <option value="none">ohne Kategorie</option>
            <CategoryOptions categories={catOptions} />
          </select>
        </div>
        <div>
          <label className="label">Richtung</label>
          <select name="dir" defaultValue={sp.dir ?? ""} className="input w-auto">
            <option value="">alle</option>
            <option value="in">Einzahlung (+)</option>
            <option value="out">Auszahlung (−)</option>
          </select>
        </div>
        <div>
          <label className="label">Rhythmus</label>
          <select name="rec" defaultValue={sp.rec ?? ""} className="input w-auto">
            <option value="">alle</option>
            {RECURRENCES.map((r) => (
              <option key={r} value={r}>{RHYTHM_OPT[r]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select name="state" defaultValue={sp.state ?? ""} className="input w-auto">
            <option value="">alle</option>
            <option value="active">aktiv</option>
            <option value="inactive">pausiert</option>
            <option value="expired">abgelaufen</option>
          </select>
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="label">Suche</label>
          <input name="q" defaultValue={sp.q ?? ""} className="input" placeholder="Bezeichnung" />
        </div>
        {hasFilter && (
          <ClearFiltersLink pageKey="/planning" basePath="/planning" className="px-2 py-2 text-sm text-slate-400 hover:text-slate-600">
            zurücksetzen
          </ClearFiltersLink>
        )}
      </AutoFilterForm>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Planposten</h2>
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">
            {hasFilter ? "Keine Planposten für diesen Filter." : "Noch keine Planposten."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <SortableTh col="name" label="Bezeichnung" sort={sp.sort ?? ""} dir={sdir} dirKey="sdir" basePath="/planning" params={filterParams} />
                  <SortableTh col="recurrence" label="Rhythmus" sort={sp.sort ?? ""} dir={sdir} dirKey="sdir" basePath="/planning" params={filterParams} />
                  <SortableTh col="startDate" label="Ab" sort={sp.sort ?? ""} dir={sdir} dirKey="sdir" basePath="/planning" params={filterParams} />
                  <SortableTh col="endDate" label="Bis" sort={sp.sort ?? ""} dir={sdir} dirKey="sdir" basePath="/planning" params={filterParams} />
                  <SortableTh col="amount" label="Betrag" sort={sp.sort ?? ""} dir={sdir} dirKey="sdir" basePath="/planning" params={filterParams} align="right" />
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <PlannedRow
                    key={p.id}
                    item={{
                      id: p.id,
                      name: p.name,
                      amount: p.amount,
                      recurrence: p.recurrence,
                      interval: p.interval,
                      startDate: p.startDate.toISOString(),
                      endDate: p.endDate ? p.endDate.toISOString() : null,
                      categoryId: p.categoryId,
                      categoryName: p.category?.name ?? null,
                      active: p.active,
                    }}
                    categories={catOptions}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={pages}
          totalItems={totalCount}
          pageSize={pageSize}
          basePath="/planning"
          params={pageParams}
        />
      </div>
    </div>
  );
}
