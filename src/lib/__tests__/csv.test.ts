import { describe, expect, it } from "vitest";
import { parseCsv } from "../import/csv";
import { categorize } from "../categorize";

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
  const rule = (o: Partial<Parameters<typeof categorize>[1][number]> = {}) => ({
    id: "1",
    categoryId: "c",
    field: "PURPOSE" as const,
    pattern: null,
    amountOp: null,
    amountValue: null,
    priority: 100,
    active: true,
    ...o,
  });
  const rules = [
    rule({ id: "1", categoryId: "miete", field: "PURPOSE", pattern: "miete", priority: 10 }),
    rule({ id: "2", categoryId: "gehalt", field: "COUNTERPARTY", pattern: "/muster/", priority: 20 }),
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
    const r = [rule({ categoryId: "einnahme", amountOp: "GT", amountValue: 0 })];
    expect(categorize({ counterparty: "X", purpose: "y", amount: 5000 }, r)).toBe("einnahme");
    expect(categorize({ counterparty: "X", purpose: "y", amount: -5000 }, r)).toBeNull();
  });

  it("kombiniert Text UND Betrag (beide müssen passen)", () => {
    const r = [rule({ categoryId: "grossmiete", pattern: "miete", amountOp: "LTE", amountValue: -100000 })];
    expect(categorize({ counterparty: "", purpose: "Miete Büro", amount: -150000 }, r)).toBe("grossmiete");
    // Text passt, Betrag nicht (zu klein im Betrag = -50000 > -100000)
    expect(categorize({ counterparty: "", purpose: "Miete Büro", amount: -50000 }, r)).toBeNull();
  });

  it("EQ trifft exakten Betrag", () => {
    const r = [rule({ categoryId: "abo", amountOp: "EQ", amountValue: -8990 })];
    expect(categorize({ counterparty: "", purpose: "", amount: -8990 }, r)).toBe("abo");
    expect(categorize({ counterparty: "", purpose: "", amount: -8991 }, r)).toBeNull();
  });
});
