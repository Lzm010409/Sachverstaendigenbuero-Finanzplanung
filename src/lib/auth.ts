import { createHmac, timingSafeEqual } from "node:crypto";

// Schlanke Single-User-Authentifizierung: ein Passwort aus der Umgebung,
// ein HMAC-signiertes Session-Cookie. Kein externer Auth-Dienst nötig.

export const SESSION_COOKIE = "liqui_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 Tage

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET fehlt oder ist zu kurz (mind. 16 Zeichen).");
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Erzeugt einen signierten Session-Token mit Ablaufzeitpunkt. */
export function createSessionToken(nowMs: number): string {
  const expires = Math.floor(nowMs / 1000) + MAX_AGE_SECONDS;
  const payload = `v1.${expires}`;
  return `${payload}.${sign(payload)}`;
}

/** Prüft einen Session-Token (Signatur + Ablauf). */
export function verifySessionToken(token: string | undefined, nowMs: number): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [v, expiresStr, mac] = parts;
  const payload = `${v}.${expiresStr}`;
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires)) return false;
  return expires * 1000 > nowMs;
}

/** Konstante-Zeit-Vergleich des eingegebenen Passworts. */
export function checkPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const SESSION_MAX_AGE = MAX_AGE_SECONDS;
