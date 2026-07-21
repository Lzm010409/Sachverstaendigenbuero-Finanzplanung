import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOpenInvoices, fetchOpenVouchers, mapTransaction } from "../sevdesk";
import { isoDate } from "../dates";

function mockSevObjects(objects: Record<string, unknown>[]) {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ objects }), { status: 200 }),
  ));
}

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

describe("sevDesk offene Posten", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("Rechnung: Status 1000 (bezahlt) wird nicht als offen geführt", async () => {
    mockSevObjects([
      { id: "1", status: "1000", sumGross: "100.00", paidAmount: 100, invoiceDate: "2024-01-01T00:00:00+01:00", timeToPay: "14" },
    ]);
    expect(await fetchOpenInvoices("t")).toHaveLength(0);
  });

  it("Rechnung: 0,01-€-Restbetrag (Rundung) gilt als bezahlt", async () => {
    mockSevObjects([
      { id: "2", status: "750", sumGross: "100.00", paidAmount: 99.99, invoiceDate: "2024-01-01T00:00:00+01:00", timeToPay: "14" },
    ]);
    expect(await fetchOpenInvoices("t")).toHaveLength(0);
  });

  it("Rechnung: offener Posten – Fälligkeit = Rechnungsdatum + timeToPay", async () => {
    mockSevObjects([
      { id: "3", status: "200", sumGross: "119.00", paidAmount: 0, invoiceDate: "2026-03-01T00:00:00+01:00", timeToPay: "30", payDate: null },
    ]);
    const items = await fetchOpenInvoices("t");
    expect(items).toHaveLength(1);
    expect(items[0].amountCents).toBe(11900);
    expect(isoDate(items[0].dueDate)).toBe("2026-03-31");
  });

  it("Beleg: Status 1000 wird übersprungen, Status 100 mit paymentDeadline bleibt", async () => {
    mockSevObjects([
      { id: "10", status: "1000", sumGross: "56.08", paidAmount: 56.08, voucherDate: "2026-01-01T00:00:00+01:00", creditDebit: "C", paymentDeadline: "2026-02-01T00:00:00+01:00" },
      { id: "11", status: "100", sumGross: "200.00", paidAmount: 0, voucherDate: "2026-01-01T00:00:00+01:00", creditDebit: "C", paymentDeadline: "2026-02-15T00:00:00+01:00" },
    ]);
    const items = await fetchOpenVouchers("t");
    expect(items).toHaveLength(1);
    expect(items[0].externalId).toBe("11");
    expect(isoDate(items[0].dueDate)).toBe("2026-02-15");
  });
});
