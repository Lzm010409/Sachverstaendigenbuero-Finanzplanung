import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// RFC 7591 – Dynamic Client Registration. claude.ai registriert sich als
// öffentlicher Client (kein Secret, PKCE). Wir speichern nur die Redirect-URIs
// und einen Namen; ausgegeben wird eine client_id.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? (body.redirect_uris as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  if (redirectUris.length === 0) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris erforderlich" },
      { status: 400 },
    );
  }
  // Nur https (oder localhost fürs Testen) zulassen.
  for (const uri of redirectUris) {
    try {
      const u = new URL(uri);
      const ok = u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1";
      if (!ok) throw new Error("scheme");
    } catch {
      return NextResponse.json({ error: "invalid_redirect_uri" }, { status: 400 });
    }
  }

  const clientName = typeof body.client_name === "string" ? body.client_name : null;
  const scope = typeof body.scope === "string" ? body.scope : null;

  const client = await prisma.oAuthClient.create({
    data: {
      clientName,
      redirectUris: JSON.stringify(redirectUris),
      tokenEndpointAuthMethod: "none",
      grantTypes: "authorization_code,refresh_token",
      scope,
    },
  });

  return NextResponse.json(
    {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: clientName ?? undefined,
      scope: scope ?? undefined,
    },
    { status: 201, headers: { "Access-Control-Allow-Origin": "*" } },
  );
}
