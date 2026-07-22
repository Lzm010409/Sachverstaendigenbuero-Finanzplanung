import { type NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { auth } from "@/auth";
import { buildDigest, digestToHtml, sendDigestEmail } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Gesichert wie /api/diagnostics: Token (DIAGNOSTICS_TOKEN) oder Sitzung.
// ?send=1 versendet den Digest per E-Mail (sofern SMTP + Empfänger gesetzt).
// ?format=html liefert die HTML-Vorschau.
export async function GET(req: NextRequest) {
  const expected = process.env.DIAGNOSTICS_TOKEN;
  const authz = req.headers.get("authorization");
  const provided =
    authz?.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : req.nextUrl.searchParams.get("token");
  const tokenOk = !!expected && !!provided && tokenMatches(provided, expected);
  let sessionOk = false;
  if (!tokenOk) {
    try {
      sessionOk = !!(await auth())?.user;
    } catch {
      sessionOk = false;
    }
  }
  if (!tokenOk && !sessionOk) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const digest = await buildDigest();

  if (["1", "true"].includes((req.nextUrl.searchParams.get("send") || "").toLowerCase())) {
    const mail = await sendDigestEmail(digest);
    return NextResponse.json({ digest, mail });
  }
  if (req.nextUrl.searchParams.get("format") === "html") {
    return new Response(digestToHtml(digest), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return NextResponse.json({ digest });
}
