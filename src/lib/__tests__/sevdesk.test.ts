import { describe, expect, it } from "vitest";
import { mapTransaction } from "../sevdesk";
import { isoDate } from "../dates";

describe("sevDesk mapTransaction", () => {
  it("mappt einen Ausgabe-Umsatz", () => {
    const m = mapTransaction({
      id: "555",
      amount: "-84.46",
      valueDate: "2026-07-16T00:00:00+02:00",
      payeePayerName: "Tankstelle",
      paymtPurpose: "Diesel",
    })!;
    expect(m.externalId).toBe("555");
    expect(m.amountCents).toBe(-8446);
    expect(m.counterparty).toBe("Tankstelle");
    expect(m.purpose).toBe("Diesel");
    expect(isoDate(m.date)).toBe("2026-07-16");
  });

  it("mappt einen Einnahme-Umsatz und komma-Betrag", () => {
    const m = mapTransaction({ id: "9", amount: "1729,78", valueDate: "2026-07-20T00:00:00+02:00" })!;
    expect(m.amountCents).toBe(172978);
    expect(m.counterparty).toBe("");
  });

  it("liefert null ohne id oder ohne lesbaren Betrag/Datum", () => {
    expect(mapTransaction({ amount: "10", valueDate: "2026-01-01" })).toBeNull();
    expect(mapTransaction({ id: "1", amount: "abc", valueDate: "2026-01-01" })).toBeNull();
    expect(mapTransaction({ id: "1", amount: "10" })).toBeNull();
  });
});
