import { describe, expect, it } from "vitest";
import { categorize, type MatchableRule } from "../categorize";

function rule(partial: Partial<MatchableRule>): MatchableRule {
  return {
    id: "r1",
    categoryId: "cat1",
    field: "PURPOSE",
    pattern: null,
    amountOp: null,
    amountValue: null,
    priority: 100,
    active: true,
    ...partial,
  };
}

const tx = (purpose: string, counterparty = "", amount = -1000) => ({ purpose, counterparty, amount });

describe("categorize – Groß-/Kleinschreibung", () => {
  it("Teilstring-Muster ist case-insensitiv", () => {
    const rules = [rule({ pattern: "vodafone" })];
    expect(categorize(tx("VODAFONE GmbH Rechnung"), rules)).toBe("cat1");
    expect(categorize(tx("vodafone"), rules)).toBe("cat1");
  });

  it("Regex-Muster ist case-insensitiv (auch ohne i-Flag)", () => {
    const rules = [rule({ pattern: "/shell|aral/" })];
    expect(categorize(tx("SHELL Deutschland"), rules)).toBe("cat1");
    expect(categorize(tx("Aral Tankstelle"), rules)).toBe("cat1");
    expect(categorize(tx("ARAL"), rules)).toBe("cat1");
  });

  it("Regex auf Gegenpartei, gemischte Schreibweise", () => {
    const rules = [rule({ field: "COUNTERPARTY", pattern: "/^amazon/" })];
    expect(categorize(tx("", "AMAZON PAYMENTS EUROPE"), rules)).toBe("cat1");
    expect(categorize(tx("", "amazon digital"), rules)).toBe("cat1");
  });

  it("doppelte/gemischte Flags brechen nicht", () => {
    const rules = [rule({ pattern: "/miete/I" })];
    expect(categorize(tx("MIETE Büro"), rules)).toBe("cat1");
  });
});
