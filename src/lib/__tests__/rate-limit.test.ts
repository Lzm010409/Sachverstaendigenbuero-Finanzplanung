import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { rateLimit, rateLimitReset, rateLimitStatus } from "../rate-limit";

const OPTS = { max: 3, fensterMs: 1000, sperreMs: 5000 };

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rateLimitReset("k");
  });
  afterEach(() => vi.useRealTimers());

  it("erlaubt bis zum Limit und sperrt danach", () => {
    expect(rateLimit("k", OPTS).erlaubt).toBe(true); // 1
    expect(rateLimit("k", OPTS).erlaubt).toBe(true); // 2
    expect(rateLimit("k", OPTS).erlaubt).toBe(true); // 3 (= max)
    const gesperrt = rateLimit("k", OPTS); // 4 -> über Limit
    expect(gesperrt.erlaubt).toBe(false);
    expect(gesperrt.warteSek).toBeGreaterThan(0);
  });

  it("hält die Sperre über die Sperrzeit und gibt danach wieder frei", () => {
    for (let i = 0; i < 4; i++) rateLimit("k", OPTS);
    expect(rateLimitStatus("k").gesperrt).toBe(true);
    vi.advanceTimersByTime(OPTS.sperreMs + 1);
    expect(rateLimitStatus("k").gesperrt).toBe(false);
    expect(rateLimit("k", OPTS).erlaubt).toBe(true);
  });

  it("vergisst alte Versuche außerhalb des Fensters", () => {
    rateLimit("k", OPTS);
    rateLimit("k", OPTS);
    vi.advanceTimersByTime(OPTS.fensterMs + 1); // Fenster verstreicht
    // Zwei alte Treffer sind verfallen -> wieder voller Spielraum.
    expect(rateLimit("k", OPTS).erlaubt).toBe(true);
    expect(rateLimit("k", OPTS).erlaubt).toBe(true);
    expect(rateLimit("k", OPTS).erlaubt).toBe(true);
    expect(rateLimit("k", OPTS).erlaubt).toBe(false);
  });

  it("rateLimitReset macht einen gesperrten Schlüssel wieder frei", () => {
    for (let i = 0; i < 4; i++) rateLimit("k", OPTS);
    expect(rateLimitStatus("k").gesperrt).toBe(true);
    rateLimitReset("k");
    expect(rateLimitStatus("k").gesperrt).toBe(false);
    expect(rateLimit("k", OPTS).erlaubt).toBe(true);
  });

  it("hält Schlüssel getrennt", () => {
    for (let i = 0; i < 4; i++) rateLimit("a", OPTS);
    expect(rateLimitStatus("a").gesperrt).toBe(true);
    expect(rateLimitStatus("b").gesperrt).toBe(false);
  });
});
