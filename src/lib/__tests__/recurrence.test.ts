import { describe, expect, it } from "vitest";
import { occurrencesBetween } from "../recurrence";
import { isoDate } from "../dates";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("occurrencesBetween", () => {
  it("ONCE innerhalb des Fensters", () => {
    const occ = occurrencesBetween(
      { recurrence: "ONCE", interval: 1, startDate: d("2026-08-15") },
      d("2026-08-01"),
      d("2026-08-31"),
    );
    expect(occ.map(isoDate)).toEqual(["2026-08-15"]);
  });

  it("ONCE außerhalb des Fensters -> leer", () => {
    const occ = occurrencesBetween(
      { recurrence: "ONCE", interval: 1, startDate: d("2026-09-15") },
      d("2026-08-01"),
      d("2026-08-31"),
    );
    expect(occ).toHaveLength(0);
  });

  it("MONTHLY erzeugt monatliche Termine", () => {
    const occ = occurrencesBetween(
      { recurrence: "MONTHLY", interval: 1, startDate: d("2026-01-31") },
      d("2026-01-01"),
      d("2026-04-30"),
    );
    // Jeder Termin wird vom Ursprung (31.) aus berechnet, damit kein Drift
    // entsteht: 31.01 -> 28.02 (Feb hat keinen 31.) -> 31.03 -> 30.04.
    expect(occ.map(isoDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("WEEKLY mit interval 2", () => {
    const occ = occurrencesBetween(
      { recurrence: "WEEKLY", interval: 2, startDate: d("2026-08-03") },
      d("2026-08-01"),
      d("2026-08-31"),
    );
    expect(occ.map(isoDate)).toEqual(["2026-08-03", "2026-08-17", "2026-08-31"]);
  });

  it("respektiert endDate", () => {
    const occ = occurrencesBetween(
      {
        recurrence: "MONTHLY",
        interval: 1,
        startDate: d("2026-01-15"),
        endDate: d("2026-03-01"),
      },
      d("2026-01-01"),
      d("2026-12-31"),
    );
    expect(occ.map(isoDate)).toEqual(["2026-01-15", "2026-02-15"]);
  });
});
