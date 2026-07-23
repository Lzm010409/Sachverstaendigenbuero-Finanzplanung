import { describe, expect, it } from "vitest";
import { categorize, type MatchableRule } from "../categorize";
import type { Node } from "../rule-expr";

const text = (field: string, op: string, value: string): Node => ({ type: "text", field: field as never, op: op as never, value });
const amount = (field: string, op: string, value: number, value2?: number): Node => ({ type: "amount", field: field as never, op: op as never, value, value2 });
const group = (op: "AND" | "OR", children: Node[], not = false): Node => ({ type: "group", op, not, children });

function ruleOf(conditions: Node, extra: Partial<MatchableRule> = {}): MatchableRule {
  return { id: "r1", categoryId: "cat1", priority: 100, active: true, conditions, ...extra };
}

const tx = (purpose: string, counterparty = "", amount = -1000) => ({ purpose, counterparty, amount });

describe("categorize – Groß-/Kleinschreibung", () => {
  it("Teilstring-Muster ist case-insensitiv", () => {
    const rules = [ruleOf(text("PURPOSE", "CONTAINS", "vodafone"))];
    expect(categorize(tx("VODAFONE GmbH Rechnung"), rules)).toBe("cat1");
    expect(categorize(tx("vodafone"), rules)).toBe("cat1");
  });

  it("Regex-Muster ist case-insensitiv (auch ohne i-Flag)", () => {
    const rules = [ruleOf(text("PURPOSE", "CONTAINS", "/shell|aral/"))];
    expect(categorize(tx("SHELL Deutschland"), rules)).toBe("cat1");
    expect(categorize(tx("Aral Tankstelle"), rules)).toBe("cat1");
    expect(categorize(tx("ARAL"), rules)).toBe("cat1");
  });

  it("Regex auf Gegenpartei, gemischte Schreibweise", () => {
    const rules = [ruleOf(text("COUNTERPARTY", "REGEX", "^amazon"))];
    expect(categorize(tx("", "AMAZON PAYMENTS EUROPE"), rules)).toBe("cat1");
    expect(categorize(tx("", "amazon digital"), rules)).toBe("cat1");
  });
});

describe("categorize – verschachtelte Logik", () => {
  it("UND: beide Bedingungen müssen zutreffen", () => {
    const rules = [ruleOf(group("AND", [text("PURPOSE", "CONTAINS", "miete"), amount("ABS_AMOUNT", "GTE", 100000)]))];
    expect(categorize({ purpose: "Miete", counterparty: "", amount: -150000 }, rules)).toBe("cat1");
    expect(categorize({ purpose: "Miete", counterparty: "", amount: -5000 }, rules)).toBeNull();
  });

  it("ODER: eine von mehreren reicht", () => {
    const rules = [ruleOf(group("OR", [text("COUNTERPARTY", "CONTAINS", "shell"), text("COUNTERPARTY", "CONTAINS", "aral")]))];
    expect(categorize(tx("", "Shell"), rules)).toBe("cat1");
    expect(categorize(tx("", "ARAL Station"), rules)).toBe("cat1");
    expect(categorize(tx("", "Edeka"), rules)).toBeNull();
  });

  it("verschachtelt: (A UND B) ODER C", () => {
    const rules = [
      ruleOf(
        group("OR", [
          group("AND", [text("PURPOSE", "CONTAINS", "rechnung"), amount("ABS_AMOUNT", "GT", 50000)]),
          text("COUNTERPARTY", "EQUALS", "Finanzamt"),
        ]),
      ),
    ];
    expect(categorize({ purpose: "Rechnung 5", counterparty: "X", amount: -60000 }, rules)).toBe("cat1");
    expect(categorize({ purpose: "Rechnung 5", counterparty: "X", amount: -100 }, rules)).toBeNull();
    expect(categorize({ purpose: "egal", counterparty: "Finanzamt", amount: -1 }, rules)).toBe("cat1");
  });

  it("NICHT negiert eine Gruppe", () => {
    const rules = [ruleOf(group("AND", [text("COUNTERPARTY", "CONTAINS", "amazon")], true))];
    expect(categorize(tx("", "Edeka"), rules)).toBe("cat1");
    expect(categorize(tx("", "Amazon"), rules)).toBeNull();
  });

  it("Betrag zwischen (BETWEEN) auf Absolutbetrag", () => {
    const rules = [ruleOf(amount("ABS_AMOUNT", "BETWEEN", 10000, 20000))];
    expect(categorize({ purpose: "", counterparty: "", amount: -15000 }, rules)).toBe("cat1");
    expect(categorize({ purpose: "", counterparty: "", amount: -25000 }, rules)).toBeNull();
  });

  it("enthält NICHT", () => {
    const rules = [ruleOf(text("PURPOSE", "NOT_CONTAINS", "storno"))];
    expect(categorize(tx("Zahlung"), rules)).toBe("cat1");
    expect(categorize(tx("Storno Zahlung"), rules)).toBeNull();
  });

  it("ANY_TEXT sucht in Gegenpartei ODER Zweck", () => {
    const rules = [ruleOf(text("ANY_TEXT", "CONTAINS", "dhl"))];
    expect(categorize({ purpose: "Paket DHL", counterparty: "X", amount: -1 }, rules)).toBe("cat1");
    expect(categorize({ purpose: "Paket", counterparty: "DHL Express", amount: -1 }, rules)).toBe("cat1");
    expect(categorize({ purpose: "Paket", counterparty: "Hermes", amount: -1 }, rules)).toBeNull();
  });

  it("Konto-Bedingung greift nur mit accountId", () => {
    const rules: MatchableRule[] = [{ id: "r", categoryId: "cat1", priority: 100, active: true, conditions: { type: "account", op: "EQ", accountId: "acc1" } }];
    expect(categorize({ purpose: "", counterparty: "", amount: -1, accountId: "acc1" }, rules)).toBe("cat1");
    expect(categorize({ purpose: "", counterparty: "", amount: -1, accountId: "acc2" }, rules)).toBeNull();
    expect(categorize({ purpose: "", counterparty: "", amount: -1 }, rules)).toBeNull();
  });

  it("Priorität: erste passende Regel gewinnt", () => {
    const rules = [
      ruleOf(text("PURPOSE", "CONTAINS", "a"), { id: "hi", categoryId: "first", priority: 1 }),
      ruleOf(text("PURPOSE", "CONTAINS", "a"), { id: "lo", categoryId: "second", priority: 5 }),
    ];
    expect(categorize(tx("aaa"), rules)).toBe("first");
  });
});
