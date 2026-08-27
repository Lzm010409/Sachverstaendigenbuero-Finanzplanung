// Gemeinsame Options für jedes Kategorie-Auswahlmenü. Reine Präsentation
// (kein "use client") – dadurch in Server- wie Client-Komponenten und in
// Formular- wie onChange-Selects nutzbar. Die Platzhalter-/Leer-Option
// rendert der jeweilige Aufrufer selbst.
//
// Gliederung: Einnahmen/Ausgaben und darin die Überkategorie. Native
// <optgroup> lassen sich nicht schachteln, deshalb trägt das Label beides
// ("Ausgaben · Fahrzeugkosten"). Überkategorien selbst sind nicht wählbar –
// sie sind reine Gliederung und nicht bebuchbar.

import { buildCategoryTree, GROUP_PREFIX, type CatNode } from "@/lib/category-tree";

export type CatOpt = {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  parentId?: string | null;
  isGroup?: boolean;
};

function toNode(c: CatOpt): CatNode {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    color: "",
    parentId: c.parentId ?? null,
    isGroup: c.isGroup ?? false,
  };
}

export function CategoryOptions({ categories }: { categories: CatOpt[] }) {
  // Überkategorien tauchen nie als wählbarer Eintrag auf.
  const nodes = categories.map(toNode).filter((c) => !c.isGroup);
  const groups = categories.map(toNode).filter((c) => c.isGroup);
  const tree = buildCategoryTree([...nodes, ...groups]);

  const render = (kind: "INCOME" | "EXPENSE", kindLabel: string) => {
    const parts = tree
      .map((entry) => ({
        ...entry,
        children: entry.children.filter((c) => c.kind === kind),
      }))
      .filter((entry) => entry.children.length > 0);
    return parts.map((entry) => (
      <optgroup
        key={`${kind}-${entry.group?.id ?? "ohne"}`}
        label={entry.group ? `${kindLabel} · ${entry.group.name}` : kindLabel}
      >
        {entry.children.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </optgroup>
    ));
  };

  return (
    <>
      {render("INCOME", "Einnahmen")}
      {render("EXPENSE", "Ausgaben")}
    </>
  );
}

/**
 * Options zur Auswahl einer Überkategorie (für die Zuordnung auf der
 * Kategorien-Seite). Optional auf eine Art eingeschränkt, weil Über- und
 * Unterkategorie immer dieselbe Art haben müssen.
 */
export function CategoryGroupOptions({
  groups,
  kind,
}: {
  groups: CatOpt[];
  kind?: "INCOME" | "EXPENSE";
}) {
  const list = groups
    .filter((g) => g.isGroup && (!kind || g.kind === kind))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const income = list.filter((g) => g.kind === "INCOME");
  const expense = list.filter((g) => g.kind === "EXPENSE");
  const block = (items: CatOpt[], label: string) =>
    items.length > 0 ? (
      <optgroup label={label}>
        {items.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </optgroup>
    ) : null;
  return (
    <>
      {block(income, "Einnahmen")}
      {block(expense, "Ausgaben")}
    </>
  );
}

/**
 * Options für Filter-Dropdowns: zusätzlich zu den einzelnen Kategorien lässt
 * sich eine ganze Überkategorie wählen (Wert "g:<id>" – siehe GROUP_PREFIX).
 * So filtert ein Klick auf „Fahrzeugkosten" über alle enthaltenen Kategorien.
 */
export function CategoryFilterOptions({ categories }: { categories: CatOpt[] }) {
  const groups = categories
    .filter((c) => c.isGroup)
    .filter((g) => categories.some((c) => c.parentId === g.id))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  return (
    <>
      {groups.length > 0 && (
        <optgroup label="Ganze Überkategorie">
          {groups.map((g) => (
            <option key={g.id} value={`${GROUP_PREFIX}${g.id}`}>
              {g.name} ({g.kind === "INCOME" ? "Einnahmen" : "Ausgaben"})
            </option>
          ))}
        </optgroup>
      )}
      <CategoryOptions categories={categories} />
    </>
  );
}
