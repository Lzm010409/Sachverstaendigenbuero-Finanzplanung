import { NextResponse, type NextRequest } from "next/server";

// Zentrale Zugangskontrolle für ALLE Routen (auch Server-Action-POSTs).
// Edge-kompatible HMAC-Prüfung des Session-Cookies via Web Crypto.

const SESSION_COOKIE = "liqui_session";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function verifyToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [v, expiresStr, mac] = parts;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires * 1000 <= Date.now()) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signature = hexToBytes(mac) as unknown as BufferSource;
    const data = new TextEncoder().encode(`${v}.${expiresStr}`) as unknown as BufferSource;
    return await crypto.subtle.verify("HMAC", key, signature, data);
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const secret = process.env.AUTH_SECRET ?? "";
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = secret ? await verifyToken(token, secret) : false;

  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Alles schützen außer Login, Next-Interna und statischen Dateien.
  matcher: ["/((?!login|api/health|_next/static|_next/image|favicon.ico).*)"],
};
