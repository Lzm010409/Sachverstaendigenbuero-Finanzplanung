import { describe, expect, it } from "vitest";
import { parseCsv } from "../import/csv";
import { categorize, type MatchableRule } from "../categorize";
import type { Node } from "../rule-expr";

// Kleine Baumbauer für die Tests.
const text = (field: string, op: string, value: string): Node => ({ type: "text", field: field as never, op: op as never, value });
const amount = (field: string, op: string, value: number, value2?: number): Node => ({ type: "amount", field: field as never, op: op as never, value, value2 });
const group = (op: "AND" | "OR", children: Node[], not = false): Node => ({ type: "group", op, not, children });
const ruleOf = (categoryId: string, conditions: Node, priority = 100): MatchableRule => ({ id: categoryId, categoryId, priority, active: true, conditions });

describe("parseCsv", () => {
  it("parst ein Sparkassen-ähnliches Format mit Semikolon", () => {
    const csv = [
      "Auftragskonto;Buchungstag;Valutadatum;Buchungstext;Verwendungszweck;Beguenstigter/Zahlungspflichtiger;Betrag;Waehrung",
      'DE12;30.06.2026;30.06.2026;LOHN;Gehalt Juni;Muster GmbH;"2.500,00";EUR',
      'DE12;01.07.2026;01.07.2026;MIETE;Buero Miete;Vermieter AG;"-1.200,00";EUR',
    ].join("\n");
    const res = parseCsv(csv);
    expect(res.transactions).toHaveLength(2);
    expect(res.transactions[0].amount).toBe(250000);
    expect(res.transactions[0].counterparty).toBe("Muster GmbH");
    expect(res.transactions[0].purpose).toBe("Gehalt Juni");
    expect(res.transactions[1].amount).toBe(-120000);
  });

  it("überspringt Metazeilen vor der Kopfzeile", () => {
    const csv = [
      "Umsätze Girokonto;von 01.01.2026;bis 31.07.2026",
      "",
      "Datum;Verwendungszweck;Betrag",
      "15.07.2026;Testzahlung;42,00",
    ].join("\n");
    const res = parseCsv(csv);
    expect(res.transactions).toHaveLength(1);
    expect(res.transactions[0].amount).toBe(4200);
  });
});

describe("categorize", () => {
  const rules = [
    { id: "1", categoryId: "miete", priority: 10, active: true, conditions: text("PURPOSE", "CONTAINS", "miete") },
    { id: "2", categoryId: "gehalt", priority: 20, active: true, conditions: text("COUNTERPARTY", "REGEX", "muster") },
  ];
  it("matcht per Teilstring im Verwendungszweck", () => {
    expect(categorize({ counterparty: "X", purpose: "Buero Miete Juli", amount: -100 }, rules)).toBe("miete");
  });
  it("matcht per Regex in der Gegenpartei", () => {
    expect(categorize({ counterparty: "Muster GmbH", purpose: "Lohn", amount: 100 }, rules)).toBe("gehalt");
  });
  it("liefert null ohne Treffer", () => {
    expect(categorize({ counterparty: "Foo", purpose: "Bar", amount: 1 }, rules)).toBeNull();
  });

  it("betrags-Bedingung: nur positive Beträge (Einnahmen)", () => {
    const r = [ruleOf("einnahme", amount("AMOUNT", "GT", 0))];
    expect(categorize({ counterparty: "X", purpose: "y", amount: 5000 }, r)).toBe("einnahme");
    expect(categorize({ counterparty: "X", purpose: "y", amount: -5000 }, r)).toBeNull();
  });

  it("kombiniert Text UND Betrag (beide müssen passen)", () => {
    const r = [
      ruleOf("grossmiete", group("AND", [text("PURPOSE", "CONTAINS", "miete"), amount("AMOUNT", "LTE", -100000)])),
    ];
    expect(categorize({ counterparty: "", purpose: "Miete Büro", amount: -150000 }, r)).toBe("grossmiete");
    expect(categorize({ counterparty: "", purpose: "Miete Büro", amount: -50000 }, r)).toBeNull();
  });

  it("EQ trifft exakten Betrag", () => {
    const r = [ruleOf("abo", amount("AMOUNT", "EQ", -8990))];
    expect(categorize({ counterparty: "", purpose: "", amount: -8990 }, r)).toBe("abo");
    expect(categorize({ counterparty: "", purpose: "", amount: -8991 }, r)).toBeNull();
  });
});
