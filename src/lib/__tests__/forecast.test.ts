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

  it("berücksichtigt offene Posten (Einmal-Events)", () => {
    const res = buildForecast({
      startBalanceCents: 100000,
      today: d("2026-08-01"),
      horizonDays: 30,
      plannedItems: [],
      oneOffs: [
        { date: d("2026-08-10"), amount: 50000 }, // Forderung
        { date: d("2026-08-20"), amount: -30000 }, // Verbindlichkeit
      ],
    });
    expect(res.totalInflow).toBe(50000);
    expect(res.totalOutflow).toBe(30000);
    expect(res.endBalance).toBe(120000);
  });

  it("setzt überfällige offene Posten auf heute an", () => {
    const res = buildForecast({
      startBalanceCents: 0,
      today: d("2026-08-01"),
      horizonDays: 30,
      plannedItems: [],
      oneOffs: [{ date: d("2026-07-15"), amount: 20000 }], // überfällig
    });
    expect(res.points[0].inflow).toBe(20000);
    expect(res.points[0].balance).toBe(20000);
  });

  it("wendet Szenario-Faktoren an (Worst Case)", () => {
    const res = buildForecast({
      startBalanceCents: 100000,
      today: d("2026-08-01"),
      horizonDays: 30,
      plannedItems: [
        { amount: 100000, recurrence: "ONCE", interval: 1, startDate: d("2026-08-05") },
        { amount: -50000, recurrence: "ONCE", interval: 1, startDate: d("2026-08-06") },
      ],
      scenario: { inflowFactor: 0.8, outflowFactor: 1.2, inflowShiftDays: 0 },
    });
    expect(res.totalInflow).toBe(80000); // 100k * 0.8
    expect(res.totalOutflow).toBe(60000); // 50k * 1.2
    expect(res.endBalance).toBe(120000); // 100k + 80k - 60k
  });

  it("wendet kategoriespezifische Faktoren an (überschreiben global)", () => {
    const res = buildForecast({
      startBalanceCents: 0,
      today: d("2026-08-01"),
      horizonDays: 30,
      plannedItems: [
        { amount: 100000, recurrence: "ONCE", interval: 1, startDate: d("2026-08-05"), categoryId: "honorar" },
        { amount: 100000, recurrence: "ONCE", interval: 1, startDate: d("2026-08-06"), categoryId: "sonstige" },
        { amount: -50000, recurrence: "ONCE", interval: 1, startDate: d("2026-08-07"), categoryId: "miete" },
      ],
      scenario: {
        inflowFactor: 1,
        outflowFactor: 1,
        inflowShiftDays: 0,
        // Honorare halbieren, Miete verdoppeln; "sonstige" bleibt global (×1)
        categoryFactors: { honorar: 0.5, miete: 2 },
      },
    });
    expect(res.totalInflow).toBe(150000); // 100k*0.5 + 100k*1
    expect(res.totalOutflow).toBe(100000); // 50k*2
    expect(res.endBalance).toBe(50000);
  });

  it("verschiebt Zuflüsse per Szenario-Zahlungsverzug", () => {
    const res = buildForecast({
      startBalanceCents: 0,
      today: d("2026-08-01"),
      horizonDays: 30,
      plannedItems: [{ amount: 10000, recurrence: "ONCE", interval: 1, startDate: d("2026-08-05") }],
      scenario: { inflowFactor: 1, outflowFactor: 1, inflowShiftDays: 10 },
    });
    // Zufluss wandert von 05.08 auf 15.08
    expect(res.points.find((p) => p.date === "2026-08-05")?.inflow).toBe(0);
    expect(res.points.find((p) => p.date === "2026-08-15")?.inflow).toBe(10000);
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
