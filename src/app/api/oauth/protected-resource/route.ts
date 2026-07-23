import { type NextRequest, NextResponse } from "next/server";
import { baseUrl, resourceUrl, DEFAULT_SCOPE } from "@/lib/oauth";

export const dynamic = "force-dynamic";

// RFC 9728 – Protected Resource Metadata. Der MCP-Endpunkt (/api/mcp) verweist
// im 401 (WWW-Authenticate) hierher; claude.ai findet darüber den zugehörigen
// Authorization-Server.
export function GET(req: NextRequest) {
  const base = baseUrl(req);
  return NextResponse.json(
    {
      resource: resourceUrl(req),
      authorization_servers: [base],
      scopes_supported: [DEFAULT_SCOPE],
      bearer_methods_supported: ["header"],
    },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}
