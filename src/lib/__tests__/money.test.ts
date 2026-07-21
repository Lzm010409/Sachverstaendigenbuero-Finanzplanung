import { describe, expect, it } from "vitest";
import { formatCents, parseAmountToCents } from "../money";

describe("parseAmountToCents", () => {
  it("parst deutsches Format", () => {
    expect(parseAmountToCents("1.234,56")).toBe(123456);
    expect(parseAmountToCents("-1.234,56")).toBe(-123456);
    expect(parseAmountToCents("0,99")).toBe(99);
  });
  it("parst englisches Format", () => {
    expect(parseAmountToCents("1,234.56")).toBe(123456);
    expect(parseAmountToCents("1234.56")).toBe(123456);
  });
  it("behandelt Klammern als negativ und Währungssymbole", () => {
    expect(parseAmountToCents("(1.000,00)")).toBe(-100000);
    expect(parseAmountToCents("1.000,00 €")).toBe(100000);
  });
  it("liefert null bei Unsinn", () => {
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
  });
});

describe("formatCents", () => {
  it("formatiert als EUR", () => {
    expect(formatCents(123456)).toContain("1.234,56");
    expect(formatCents(123456)).toContain("€");
  });
});
