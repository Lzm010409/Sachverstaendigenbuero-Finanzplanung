import { timingSafeEqual } from "node:crypto";

/** Konstante-Zeit-Vergleich des Fallback-Passworts gegen APP_PASSWORD. */
export function checkPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
