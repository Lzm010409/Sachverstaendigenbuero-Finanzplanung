// Vorschlag für Überkategorien auf Basis der tatsächlich vorhandenen
// Kategorienamen. Rein heuristisch über Stichwörter – der Vorschlag wird dem
// Nutzer zur Bestätigung vorgelegt und erst auf Klick angewendet. Er ändert
// nie bestehende Zuordnungen: Kategorien, die bereits einer Überkategorie
// zugeordnet sind, bleiben unangetastet.

export type Vorschlag = {
  /** Name der vorgeschlagenen Überkategorie. */
  gruppe: string;
  farbe: string;
  kind: "INCOME" | "EXPENSE";
  /** IDs der Kategorien, die hineinsollen. */
  categoryIds: string[];
  /** Namen – nur für die Anzeige. */
  namen: string[];
};

type Regel = {
  gruppe: string;
  farbe: string;
  kind: "INCOME" | "EXPENSE";
  /** Kleingeschriebene Stichwörter; ein Treffer genügt. */
  stichwoerter: string[];
};

// Reihenfolge = Priorität: die erste passende Regel gewinnt. Deshalb stehen
// die spezifischen Regeln oben – "KFZ-Versicherung" landet bei den
// Fahrzeugkosten (nicht bei den Versicherungen) und "Steuerberater" bei
// Beratung & Recht (nicht bei den Steuern).
const REGELN: Regel[] = [
  {
    gruppe: "Fahrzeugkosten",
    farbe: "#dc2626",
    kind: "EXPENSE",
    stichwoerter: ["benzin", "kfz", "tank", "leasing", "fahrzeug", "reisekosten", "maut", "ladestrom"],
  },
  {
    gruppe: "IT & Kommunikation",
    farbe: "#0891b2",
    kind: "EXPENSE",
    stichwoerter: ["software", "lizenz", "it", "internet", "mobil", "telefon", "hosting", "domain"],
  },
  {
    gruppe: "Personal",
    farbe: "#7c3aed",
    kind: "EXPENSE",
    stichwoerter: ["gehalt", "gehälter", "personal", "lohn", "krankenkasse", "sozial", "knappschaft"],
  },
  {
    gruppe: "Beratung & Recht",
    farbe: "#2563eb",
    kind: "EXPENSE",
    stichwoerter: ["steuerberater", "rechtsschutz", "rechtschutz", "anwalt", "beratung", "notar"],
  },
  {
    gruppe: "Steuern & Abgaben",
    farbe: "#475569",
    kind: "EXPENSE",
    stichwoerter: ["steuer", "umsatzsteuer", "gewerbesteuer", "abgabe", "finanzamt"],
  },
  {
    gruppe: "Versicherungen",
    farbe: "#1d4ed8",
    kind: "EXPENSE",
    stichwoerter: ["versicherung"],
  },
  {
    gruppe: "Büro & Verwaltung",
    farbe: "#b45309",
    kind: "EXPENSE",
    stichwoerter: ["büro", "buero", "miete", "porto", "bankgebühr", "kontoführung", "karten", "bürobedarf"],
  },
  {
    gruppe: "Vertrieb & Repräsentation",
    farbe: "#db2777",
    kind: "EXPENSE",
    stichwoerter: ["marketing", "werbe", "bewirtung", "geschäftsessen", "repräsent"],
  },
  {
    gruppe: "Privat & Kapital",
    farbe: "#64748b",
    kind: "EXPENSE",
    stichwoerter: ["privatentnahme", "entnahme", "wertpapier", "kapitalanlage", "privat"],
  },
  {
    gruppe: "Umsatzerlöse",
    farbe: "#0f766e",
    kind: "INCOME",
    stichwoerter: ["honorar", "gutachten", "erlös", "umsatz"],
  },
  {
    gruppe: "Sonstige Erträge",
    farbe: "#0d9488",
    kind: "INCOME",
    stichwoerter: ["sonstige einnahme", "zins", "ertrag", "erstattung"],
  },
];

export type KategorieEingabe = {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  parentId: string | null;
  isGroup: boolean;
};

/**
 * Bildet einen Vorschlag: welche Kategorie käme in welche Überkategorie?
 * Berücksichtigt nur noch nicht zugeordnete, echte Kategorien. Gruppen mit
 * weniger als zwei Treffern werden verworfen – eine Klammer um eine einzelne
 * Kategorie bringt keine Übersicht.
 */
export function schlageUeberkategorienVor(kategorien: KategorieEingabe[]): Vorschlag[] {
  const offen = kategorien.filter((c) => !c.isGroup && !c.parentId);
  const treffer = new Map<string, Vorschlag>();

  for (const cat of offen) {
    const name = cat.name.toLowerCase();
    const regel = REGELN.find(
      (r) => r.kind === cat.kind && r.stichwoerter.some((w) => name.includes(w)),
    );
    if (!regel) continue;
    const key = regel.gruppe;
    const eintrag = treffer.get(key) ?? {
      gruppe: regel.gruppe,
      farbe: regel.farbe,
      kind: regel.kind,
      categoryIds: [],
      namen: [],
    };
    eintrag.categoryIds.push(cat.id);
    eintrag.namen.push(cat.name);
    treffer.set(key, eintrag);
  }

  return [...treffer.values()]
    .filter((v) => v.categoryIds.length >= 2)
    .sort((a, b) => a.gruppe.localeCompare(b.gruppe, "de"));
}
