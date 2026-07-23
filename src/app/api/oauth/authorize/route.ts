import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  CODE_TTL_SEC,
  DEFAULT_SCOPE,
  baseUrl,
  parseRedirectUris,
  randomToken,
} from "@/lib/oauth";

export const dynamic = "force-dynamic";

// OAuth 2.1 Authorization Endpoint (Authorization-Code + PKCE).
// Ist der Nutzer nicht angemeldet, wird auf /login mit callbackUrl zurück auf
// genau diese Authorize-URL geleitet. Nach Login kommt der Nutzer hierher
// zurück, ein Code wird ausgestellt und an die redirect_uri des Clients geliefert.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const clientId = q.get("client_id") ?? "";
  const redirectUri = q.get("redirect_uri") ?? "";
  const responseType = q.get("response_type") ?? "";
  const codeChallenge = q.get("code_challenge") ?? "";
  const codeChallengeMethod = q.get("code_challenge_method") ?? "";
  const scope = q.get("scope") || DEFAULT_SCOPE;
  const state = q.get("state") ?? "";
  const resource = q.get("resource");

  // Client + Redirect-URI zuerst prüfen – nur dann dürfen wir zur redirect_uri
  // umleiten (sonst Open-Redirect-Gefahr).
  const client = clientId ? await prisma.oAuthClient.findUnique({ where: { id: clientId } }) : null;
  if (!client) {
    return htmlError("Unbekannter Client (client_id).");
  }
  const allowed = parseRedirectUris(client.redirectUris);
  if (!redirectUri || !allowed.includes(redirectUri)) {
    return htmlError("Ungültige redirect_uri.");
  }

  const redirectBack = (paramsInit: Record<string, string>) => {
    const url = new URL(redirectUri);
    for (const [k, v] of Object.entries(paramsInit)) url.searchParams.set(k, v);
    if (state) url.searchParams.set("state", state);
    return NextResponse.redirect(url.toString());
  };

  if (responseType !== "code") {
    return redirectBack({ error: "unsupported_response_type" });
  }
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return redirectBack({ error: "invalid_request", error_description: "PKCE S256 erforderlich" });
  }

  // Angemeldet? Sonst auf Login mit Rücksprung auf diese Authorize-URL.
  const session = await auth();
  if (!session?.user) {
    const callback = req.nextUrl.pathname + req.nextUrl.search;
    const login = new URL("/login", baseUrl(req));
    login.searchParams.set("callbackUrl", callback);
    return NextResponse.redirect(login.toString());
  }

  const code = randomToken(32);
  await prisma.oAuthCode.create({
    data: {
      code,
      clientId: client.id,
      redirectUri,
      scope,
      codeChallenge,
      codeChallengeMethod: "S256",
      resource: resource ?? null,
      expiresAt: new Date(Date.now() + CODE_TTL_SEC * 1000),
    },
  });

  return redirectBack({ code });
}

function htmlError(message: string) {
  return new NextResponse(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>OAuth-Fehler</title></head>` +
      `<body style="font-family:system-ui;padding:2rem;color:#0f172a"><h1>Autorisierung fehlgeschlagen</h1>` +
      `<p>${message}</p></body></html>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
