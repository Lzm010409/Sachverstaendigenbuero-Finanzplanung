// Überkategorien: Baumaufbau, Summen-Roll-up und Filter-Auflösung.
//
// Genau EINE Ebene: eine Überkategorie (isGroup) hat selbst keinen parentId,
// eine Kategorie mit parentId hat nie Kinder. Dadurch bleiben alle Summen
// einstufig – die Überkategorie ist exakt die Summe ihrer Kinder, es gibt
// keine Doppelzählung, weil auf eine Überkategorie nichts gebucht werden kann.

export type CatNode = {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  color: string;
  parentId: string | null;
  isGroup: boolean;
};

/** Auswahl der Felder, die jede Kategorie-Query für den Baum laden muss. */
export const CATEGORY_TREE_SELECT = {
  id: true,
  name: true,
  kind: true,
  color: true,
  parentId: true,
  isGroup: true,
} as const;

/** Präfix, mit dem eine Überkategorie in URL-Filtern adressiert wird. */
export const GROUP_PREFIX = "g:";

export type CatGroup<T> = {
  /** Überkategorie – null für Kategorien ohne Überkategorie. */
  group: CatNode | null;
  rows: T[];
};

/**
 * Ordnet beliebige Zeilen mit Kategoriebezug ihren Überkategorien zu.
 * Zeilen ohne Überkategorie landen gesammelt in einer Gruppe mit `group: null`,
 * die immer ans Ende sortiert wird. Die Reihenfolge der Zeilen innerhalb einer
 * Gruppe bleibt erhalten (der Aufrufer hat bereits sortiert).
 */
export function groupRowsByCategoryGroup<T>(
  rows: T[],
  categoryIdOf: (row: T) => string | null | undefined,
  categories: CatNode[],
): CatGroup<T>[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const out: CatGroup<T>[] = [];
  const idx = new Map<string, number>();
  const OHNE = "__ohne__";

  for (const row of rows) {
    const cat = categoryIdOf(row) ? byId.get(categoryIdOf(row)!) : undefined;
    const group = cat?.parentId ? byId.get(cat.parentId) ?? null : null;
    const key = group?.id ?? OHNE;
    let i = idx.get(key);
    if (i == null) {
      i = out.length;
      idx.set(key, i);
      out.push({ group: group ?? null, rows: [] });
    }
    out[i].rows.push(row);
  }

  // Gruppen alphabetisch, "ohne Überkategorie" zuletzt.
  return out.sort((a, b) => {
    if (!a.group) return 1;
    if (!b.group) return -1;
    return a.group.name.localeCompare(b.group.name, "de");
  });
}

/**
 * Summiert eine Kennzahl-Map je Kategorie auf Überkategorie-Ebene hoch.
 * Liefert eine Map Überkategorie-ID -> Summe der Kinder.
 */
export function rollUpByGroup(
  perCategory: Map<string, number>,
  categories: CatNode[],
): Map<string, number> {
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const out = new Map<string, number>();
  for (const [catId, value] of perCategory) {
    const parentId = parentOf.get(catId);
    if (!parentId) continue;
    out.set(parentId, (out.get(parentId) ?? 0) + value);
  }
  return out;
}

/** Summiert beliebige Zeilen einer Gruppe über einen Feldzugriff. */
export function sumBy<T>(rows: T[], value: (row: T) => number): number {
  let total = 0;
  for (const r of rows) total += value(r) || 0;
  return total;
}

/** Baut die Auswahlliste: Überkategorien mit ihren Kindern, dann der Rest. */
export function buildCategoryTree(categories: CatNode[]): {
  group: CatNode | null;
  children: CatNode[];
}[] {
  const groups = categories.filter((c) => c.isGroup);
  const leaves = categories.filter((c) => !c.isGroup);
  const byParent = new Map<string, CatNode[]>();
  for (const l of leaves) {
    if (!l.parentId) continue;
    const arr = byParent.get(l.parentId) ?? [];
    arr.push(l);
    byParent.set(l.parentId, arr);
  }
  const sortByName = (a: CatNode, b: CatNode) => a.name.localeCompare(b.name, "de");
  const out: { group: CatNode | null; children: CatNode[] }[] = groups
    .slice()
    .sort(sortByName)
    .map((g) => ({ group: g as CatNode | null, children: (byParent.get(g.id) ?? []).sort(sortByName) }))
    // Leere Überkategorien nicht in Auswahlmenüs anbieten.
    .filter((e) => e.children.length > 0);
  const ungrouped = leaves.filter((l) => !l.parentId || !byParent.has(l.parentId)).sort(sortByName);
  if (ungrouped.length > 0) out.push({ group: null, children: ungrouped });
  return out;
}

/**
 * Löst einen `cat`-Filterwert auf. Neben einer Kategorie-ID, "none" und "all"
 * versteht der Filter jetzt auch "g:<id>" für eine ganze Überkategorie – das
 * ergibt die Liste aller zugehörigen Kindkategorien.
 */
export function resolveCategoryFilter(
  cat: string | undefined,
  categories: Pick<CatNode, "id" | "parentId">[],
): { kind: "all" } | { kind: "none" } | { kind: "ids"; ids: string[] } {
  if (!cat || cat === "all") return { kind: "all" };
  if (cat === "none") return { kind: "none" };
  if (cat.startsWith(GROUP_PREFIX)) {
    const groupId = cat.slice(GROUP_PREFIX.length);
    const ids = categories.filter((c) => c.parentId === groupId).map((c) => c.id);
    // Leere Überkategorie: bewusst leere Treffermenge statt "alles".
    return { kind: "ids", ids };
  }
  return { kind: "ids", ids: [cat] };
}

/** Prisma-`where`-Fragment für einen aufgelösten Kategoriefilter. */
export function categoryWhere(
  resolved: ReturnType<typeof resolveCategoryFilter>,
): { categoryId?: string | null | { in: string[] } } {
  if (resolved.kind === "all") return {};
  if (resolved.kind === "none") return { categoryId: null };
  return { categoryId: { in: resolved.ids } };
}
