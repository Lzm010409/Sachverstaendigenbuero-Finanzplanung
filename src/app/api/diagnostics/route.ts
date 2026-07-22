import { type NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { runDiagnostics, formatReport } from "@/lib/diagnostics";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Zeitkonstanter Vergleich zweier Tokens (über SHA-256, damit die Länge nicht
// durchsickert und timingSafeEqual gleich lange Buffer erhält).
function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const header = req.headers.get("x-diagnostics-token");
  if (header) return header.trim();
  const q = req.nextUrl.searchParams.get("token");
  return q ? q.trim() : null;
}

export async function GET(req: NextRequest) {
  const expected = process.env.DIAGNOSTICS_TOKEN;

  // Zugang: entweder gültiges Diagnose-Token ODER angemeldete Sitzung (für die
  // In-App-Ansicht). Ohne konfiguriertes Token ist der Token-Weg deaktiviert
  // (fail closed) – die Sitzung bleibt möglich.
  const provided = extractToken(req);
  const tokenOk = !!expected && !!provided && tokenMatches(provided, expected);
  let sessionOk = false;
  if (!tokenOk) {
    try {
      const session = await auth();
      sessionOk = !!session?.user;
    } catch {
      sessionOk = false;
    }
  }
  if (!tokenOk && !sessionOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const deep = ["1", "true", "yes"].includes(
    (req.nextUrl.searchParams.get("deep") || "").toLowerCase(),
  );
  const report = await runDiagnostics({ deep });

  if (req.nextUrl.searchParams.get("format") === "text") {
    return new Response(formatReport(report), {
      status: report.ok ? 200 : 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}
