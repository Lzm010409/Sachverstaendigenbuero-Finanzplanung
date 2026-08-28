import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  ACCESS_TTL_SEC,
  REFRESH_TTL_SEC,
  baseUrl,
  issueAccessToken,
  randomToken,
  resourceUrl,
  sha256b64,
  verifyPkceS256,
} from "@/lib/oauth";

export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

function err(code: string, status = 400, description?: string) {
  return NextResponse.json(
    { error: code, ...(description ? { error_description: description } : {}) },
    { status, headers: CORS },
  );
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// OAuth 2.1 Token Endpoint. Öffentlicher Client (kein Secret): Bindung über
// client_id + PKCE. Unterstützt authorization_code und refresh_token.
export async function POST(req: NextRequest) {
  const form = await readForm(req);
  const grantType = form.get("grant_type");
  const clientId = form.get("client_id") ?? "";

  const client = clientId ? await prisma.oAuthClient.findUnique({ where: { id: clientId } }) : null;
  if (!client) return err("invalid_client", 401);

  const issuer = baseUrl(req);
  const audience = resourceUrl(req);

  if (grantType === "authorization_code") {
    const code = form.get("code") ?? "";
    const redirectUri = form.get("redirect_uri") ?? "";
    const verifier = form.get("code_verifier") ?? "";
    if (!code || !verifier) return err("invalid_request", 400, "code/code_verifier fehlt");

    const rec = await prisma.oAuthCode.findUnique({ where: { code } });
    if (!rec || rec.clientId !== client.id) return err("invalid_grant", 400, "Code ungültig");
    if (rec.consumedAt || rec.expiresAt.getTime() < Date.now()) {
      return err("invalid_grant", 400, "Code abgelaufen oder bereits verwendet");
    }
    if (rec.redirectUri !== redirectUri) return err("invalid_grant", 400, "redirect_uri stimmt nicht");
    if (!verifyPkceS256(verifier, rec.codeChallenge)) return err("invalid_grant", 400, "PKCE fehlgeschlagen");

    // Single-Use: sofort entwerten.
    await prisma.oAuthCode.update({ where: { code }, data: { consumedAt: new Date() } });

    return issueTokens(client.id, rec.scope, issuer, audience, rec.resource);
  }

  if (grantType === "refresh_token") {
    const refresh = form.get("refresh_token") ?? "";
    if (!refresh) return err("invalid_request", 400, "refresh_token fehlt");
    const hash = sha256b64(refresh);
    const rec = await prisma.oAuthToken.findUnique({ where: { refreshHash: hash } });
    if (!rec || rec.clientId !== client.id) return err("invalid_grant", 400, "Refresh-Token ungültig");
    if (rec.revokedAt || rec.expiresAt.getTime() < Date.now()) {
      return err("invalid_grant", 400, "Refresh-Token abgelaufen");
    }
    // Rotation: altes Refresh-Token entwerten, neues ausstellen.
    await prisma.oAuthToken.update({ where: { id: rec.id }, data: { revokedAt: new Date() } });
    return issueTokens(client.id, rec.scope, issuer, audience, rec.resource);
  }

  return err("unsupported_grant_type", 400);
}

async function issueTokens(
  clientId: string,
  scope: string,
  issuer: string,
  audience: string,
  resource: string | null,
) {
  const accessToken = await issueAccessToken({ issuer, audience, clientId, scope });
  const refresh = randomToken(32);
  await prisma.oAuthToken.create({
    data: {
      refreshHash: sha256b64(refresh),
      clientId,
      scope,
      resource,
      expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
    },
  });
  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_SEC,
      refresh_token: refresh,
      scope,
    },
    { headers: CORS },
  );
}

// Sowohl application/x-www-form-urlencoded (Standard) als auch JSON annehmen.
async function readForm(req: NextRequest): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      const j = (await req.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(j)) if (typeof v === "string") map.set(k, v);
    } else {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) if (typeof v === "string") map.set(k, v);
    }
  } catch {
    /* leer lassen */
  }
  // client_id/secret dürfen auch per Basic-Auth kommen.
  const authz = req.headers.get("authorization");
  if (authz?.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = Buffer.from(authz.slice(6).trim(), "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      if (idx >= 0 && !map.has("client_id")) map.set("client_id", decoded.slice(0, idx));
    } catch {
      /* ignorieren */
    }
  }
  return map;
}
