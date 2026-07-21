import { describe, expect, it } from "vitest";
import { buildForecast } from "../forecast";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("buildForecast", () => {
  it("projiziert Saldo mit einer monatlichen Ausgabe", () => {
    const res = buildForecast({
      startBalanceCents: 500000, // 5.000 €
      today: d("2026-08-01"),
      horizonDays: 40,
      plannedItems: [
        {
          name: "Miete",
          amount: -120000, // -1.200 €
          recurrence: "MONTHLY",
          interval: 1,
          startDate: d("2026-08-05"),
        },
      ],
    });
    // Start
    expect(res.points[0].balance).toBe(500000);
    // Nach dem 5.8. (Tag 4) -> 3.800 €
    expect(res.points[4].balance).toBe(380000);
    // Innerhalb 40 Tagen fällt Miete am 05.08 und 05.09 an
    expect(res.totalOutflow).toBe(240000);
    expect(res.endBalance).toBe(500000 - 240000);
    expect(res.lowest.balance).toBe(260000);
  });

  it("findet den Liquiditäts-Tiefpunkt", () => {
    const res = buildForecast({
      startBalanceCents: 100000,
      today: d("2026-08-01"),
      horizonDays: 30,
      plannedItems: [
        { amount: -90000, recurrence: "ONCE", interval: 1, startDate: d("2026-08-10") },
        { amount: 200000, recurrence: "ONCE", interval: 1, startDate: d("2026-08-20") },
      ],
    });
    expect(res.lowest.balance).toBe(10000);
    expect(res.lowest.date).toBe("2026-08-10");
    expect(res.endBalance).toBe(210000);
  });

  it("kombiniert mehrere Einträge an einem Tag", () => {
    const res = buildForecast({
      startBalanceCents: 0,
      today: d("2026-08-01"),
      horizonDays: 5,
      plannedItems: [
        { amount: 50000, recurrence: "ONCE", interval: 1, startDate: d("2026-08-03") },
        { amount: -20000, recurrence: "ONCE", interval: 1, startDate: d("2026-08-03") },
      ],
    });
    const day3 = res.points.find((p) => p.date === "2026-08-03")!;
    expect(day3.inflow).toBe(50000);
    expect(day3.outflow).toBe(20000);
    expect(day3.balance).toBe(30000);
  });
});
