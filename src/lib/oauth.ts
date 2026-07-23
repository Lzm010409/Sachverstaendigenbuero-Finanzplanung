// OAuth 2.1 Authorization Server – Kernlogik (App-eigener OAuth für den
// MCP-Connector). Öffentlicher Client + PKCE (S256), Authorization-Code-Flow
// mit Refresh-Tokens. Zugriffstokens sind signierte JWTs (HS256, zustandslos);
// Refresh-Tokens werden als SHA-256-Hash in der DB abgelegt.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

// Der einzige Nutzer der App (siehe auth.ts). Aggregat-Zugriff, kein Personenbezug.
export const OAUTH_SUBJECT = "owner";
export const DEFAULT_SCOPE = "liquidity";
export const ACCESS_TTL_SEC = 60 * 60; // 1 Stunde
export const REFRESH_TTL_SEC = 60 * 60 * 24 * 30; // 30 Tage
export const CODE_TTL_SEC = 60 * 10; // 10 Minuten

function signingSecret(): Uint8Array {
  const s = process.env.OAUTH_SIGNING_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("OAUTH_SIGNING_SECRET/AUTH_SECRET fehlt");
  return new TextEncoder().encode(s);
}

// Öffentliche Basis-URL aus den (Proxy-)Headern ableiten. Coolify terminiert
// TLS extern; intern kommt oft http an -> x-forwarded-proto bevorzugen.
export function baseUrl(req: Request): string {
  const env = process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (env) return env.replace(/\/$/, "");
  const h = req.headers;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "localhost";
  return `${proto}://${host}`;
}

export function resourceUrl(req: Request): string {
  return `${baseUrl(req)}/api/mcp`;
}

// --- Zufalls-/Hash-Helfer ------------------------------------------------------

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256b64(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

// PKCE S256 prüfen: base64url(sha256(verifier)) === challenge (konstante Zeit).
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  try {
    const computed = createHash("sha256").update(verifier).digest();
    const expected = Buffer.from(challenge, "base64url");
    if (computed.length !== expected.length) return false;
    return timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

// --- Zugriffstoken (JWT) -------------------------------------------------------

export async function issueAccessToken(opts: {
  issuer: string;
  audience: string;
  clientId: string;
  scope: string;
}): Promise<string> {
  return new SignJWT({ scope: opts.scope, client_id: opts.clientId })
    .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
    .setSubject(OAUTH_SUBJECT)
    .setIssuer(opts.issuer)
    .setAudience(opts.audience)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .setJti(randomToken(16))
    .sign(signingSecret());
}

export async function verifyAccessToken(
  token: string,
  audience: string,
): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, signingSecret(), {
      audience,
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

// Erlaubte Redirect-URIs eines Clients (aus JSON-String).
export function parseRedirectUris(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
