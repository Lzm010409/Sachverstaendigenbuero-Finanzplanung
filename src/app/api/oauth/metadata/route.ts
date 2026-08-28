import { type NextRequest, NextResponse } from "next/server";
import { baseUrl, DEFAULT_SCOPE } from "@/lib/oauth";

export const dynamic = "force-dynamic";

// RFC 8414 – Authorization Server Metadata. Wird über /.well-known/
// oauth-authorization-server (Rewrite) ausgeliefert, damit claude.ai den
// OAuth-Server automatisch findet.
export function GET(req: NextRequest) {
  const base = baseUrl(req);
  return NextResponse.json(
    {
      issuer: base,
      authorization_endpoint: `${base}/api/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      registration_endpoint: `${base}/api/oauth/register`,
      scopes_supported: [DEFAULT_SCOPE],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}
