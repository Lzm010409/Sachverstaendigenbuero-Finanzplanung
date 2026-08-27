import { describe, expect, it } from "vitest";
import {
  buildCategoryTree,
  groupRowsByCategoryGroup,
  resolveCategoryFilter,
  rollUpByGroup,
  sumBy,
  GROUP_PREFIX,
  type CatNode,
} from "../category-tree";
import { schlageUeberkategorienVor } from "../category-group-suggest";

const node = (p: Partial<CatNode> & { id: string; name: string }): CatNode => ({
  kind: "EXPENSE",
  color: "#000",
  parentId: null,
  isGroup: false,
  ...p,
});

const FAHRZEUG = node({ id: "g1", name: "Fahrzeugkosten", isGroup: true });
const BENZIN = node({ id: "c1", name: "Benzin", parentId: "g1" });
const LEASING = node({ id: "c2", name: "Leasing", parentId: "g1" });
const MIETE = node({ id: "c3", name: "Miete" });
const KATEGORIEN = [FAHRZEUG, BENZIN, LEASING, MIETE];

describe("buildCategoryTree", () => {
  it("gruppiert Kinder unter ihrer Überkategorie und hängt Ungruppierte ans Ende", () => {
    const tree = buildCategoryTree(KATEGORIEN);
    expect(tree).toHaveLength(2);
    expect(tree[0].group?.name).toBe("Fahrzeugkosten");
    expect(tree[0].children.map((c) => c.name)).toEqual(["Benzin", "Leasing"]);
    expect(tree[1].group).toBeNull();
    expect(tree[1].children.map((c) => c.name)).toEqual(["Miete"]);
  });

  it("blendet leere Überkategorien aus", () => {
    const leer = node({ id: "g2", name: "Leer", isGroup: true });
    const tree = buildCategoryTree([...KATEGORIEN, leer]);
    expect(tree.some((e) => e.group?.id === "g2")).toBe(false);
  });
});

describe("groupRowsByCategoryGroup", () => {
  it("ordnet Zeilen ihrer Überkategorie zu, Ungruppierte zuletzt", () => {
    const rows = [
      { catId: "c3", wert: 5 },
      { catId: "c1", wert: 10 },
      { catId: "c2", wert: 20 },
    ];
    const g = groupRowsByCategoryGroup(rows, (r) => r.catId, KATEGORIEN);
    expect(g).toHaveLength(2);
    expect(g[0].group?.name).toBe("Fahrzeugkosten");
    expect(sumBy(g[0].rows, (r) => r.wert)).toBe(30);
    expect(g[1].group).toBeNull();
    expect(sumBy(g[1].rows, (r) => r.wert)).toBe(5);
  });

  it("behandelt Zeilen ohne Kategorie als ungruppiert", () => {
    const g = groupRowsByCategoryGroup([{ catId: null }], (r) => r.catId, KATEGORIEN);
    expect(g).toHaveLength(1);
    expect(g[0].group).toBeNull();
  });
});

describe("rollUpByGroup", () => {
  it("summiert Kategoriewerte auf die Überkategorie", () => {
    const per = new Map([["c1", 100], ["c2", 250], ["c3", 70]]);
    const roll = rollUpByGroup(per, KATEGORIEN);
    expect(roll.get("g1")).toBe(350);
    // Kategorien ohne Überkategorie erzeugen keinen Eintrag.
    expect(roll.has("c3")).toBe(false);
  });
});

describe("resolveCategoryFilter", () => {
  it("löst eine Überkategorie in ihre Kindkategorien auf", () => {
    const r = resolveCategoryFilter(`${GROUP_PREFIX}g1`, KATEGORIEN);
    expect(r).toEqual({ kind: "ids", ids: ["c1", "c2"] });
  });

  it("versteht all, none und eine einzelne Kategorie", () => {
    expect(resolveCategoryFilter("all", KATEGORIEN).kind).toBe("all");
    expect(resolveCategoryFilter(undefined, KATEGORIEN).kind).toBe("all");
    expect(resolveCategoryFilter("none", KATEGORIEN).kind).toBe("none");
    expect(resolveCategoryFilter("c1", KATEGORIEN)).toEqual({ kind: "ids", ids: ["c1"] });
  });

  it("liefert für eine leere Überkategorie eine leere Treffermenge, nicht alles", () => {
    const r = resolveCategoryFilter(`${GROUP_PREFIX}gLeer`, KATEGORIEN);
    expect(r).toEqual({ kind: "ids", ids: [] });
  });
});

describe("schlageUeberkategorienVor", () => {
  const eingabe = (name: string, kind: "INCOME" | "EXPENSE" = "EXPENSE") => ({
    id: name,
    name,
    kind,
    parentId: null,
    isGroup: false,
  });

  it("bündelt Fahrzeugthemen und ordnet die KFZ-Versicherung dort ein", () => {
    const v = schlageUeberkategorienVor([
      eingabe("Benzin"),
      eingabe("Mietleasing Kfz"),
      eingabe("KFZ-Versicherung"),
      eingabe("Sonstige KFZ-Kosten"),
    ]);
    const fahrzeug = v.find((x) => x.gruppe === "Fahrzeugkosten");
    expect(fahrzeug?.namen).toContain("KFZ-Versicherung");
    expect(fahrzeug?.categoryIds).toHaveLength(4);
  });

  it("verwirft Gruppen mit nur einer Kategorie", () => {
    const v = schlageUeberkategorienVor([eingabe("Bürobedarf")]);
    expect(v).toHaveLength(0);
  });

  it("überspringt bereits zugeordnete Kategorien und Überkategorien selbst", () => {
    const v = schlageUeberkategorienVor([
      { ...eingabe("Benzin"), parentId: "vorhanden" },
      { ...eingabe("Tankstelle"), parentId: "vorhanden" },
      { ...eingabe("Fahrzeugkosten"), isGroup: true },
    ]);
    expect(v).toHaveLength(0);
  });

  it("trennt Einnahmen und Ausgaben", () => {
    const v = schlageUeberkategorienVor([
      eingabe("Honorare / Gutachten", "INCOME"),
      eingabe("Umsatzerlöse Sonstige", "INCOME"),
      eingabe("Benzin"),
      eingabe("Tankstelle"),
    ]);
    const erloese = v.find((x) => x.gruppe === "Umsatzerlöse");
    expect(erloese?.kind).toBe("INCOME");
    expect(v.find((x) => x.gruppe === "Fahrzeugkosten")?.kind).toBe("EXPENSE");
  });
});
