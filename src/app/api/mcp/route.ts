import { type NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { agentKpis, agentForecast, agentOpenItemsAging, agentTax, agentBudgets, agentSummary } from "@/lib/agent";
import { baseUrl, resourceUrl, verifyAccessToken } from "@/lib/oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Remote-MCP-Server (Streamable HTTP, JSON-RPC) für claude.ai-Connectoren.
// Gibt AUSSCHLIESSLICH aggregierte, nicht-identifizierende Daten aus (siehe
// src/lib/agent.ts). Zugriff per OAuth 2.1 (Bearer-JWT, siehe /api/oauth/*) –
// claude.ai richtet den Connector darüber ein. Als Fallback wird weiterhin ein
// statisches MCP_TOKEN akzeptiert (Authorization: Bearer <token> oder ?token=).
// URL: https://<host>/api/mcp

const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  { name: "get_liquidity_kpis", description: "Aktuelle Liquiditäts-Kennzahlen (verfügbare Liquidität, Ø Einnahmen/Ausgaben pro Monat, Netto, Reichweite/Runway in Monaten, offene Forderungen/Verbindlichkeiten, Working Capital). Aggregiert, in EUR.", fn: agentKpis },
  { name: "get_forecast", description: "Rollierende 13-Wochen-Liquiditätsvorschau (Start/Ende/Netto je Woche), Tiefpunkt, Unterschreitung der Mindestliquidität und 180-Tage-Prognose. Aggregiert, in EUR.", fn: agentForecast },
  { name: "get_open_items_aging", description: "Offene Forderungen inkl. Altersstruktur (Aging), DSO, Überfälligkeit sowie Klumpenrisiko (Top-Debitoren ANONYMISIERT als Rang/Anteil, HHI). Aggregiert, in EUR.", fn: agentOpenItemsAging },
  { name: "get_tax_preview", description: "Umsatzsteuer-Vorschau je Voranmeldungs-Periode (Fälligkeit, USt auf Erlöse, Vorsteuer, Zahllast). Aggregiert, in EUR.", fn: agentTax },
  { name: "get_budgets", description: "Budget-Status des laufenden Monats: Ist/Soll/Hochrechnung je Kategorie, Auslastung, wie viele Budgets über Limit bzw. nah dran. Aggregiert, in EUR.", fn: agentBudgets },
  { name: "get_summary", description: "Gesamtüberblick: KPIs + Forecast + Aging + Steuer + Budgets in einem Aufruf. Aggregiert, in EUR.", fn: agentSummary },
] as const;

const EMPTY_SCHEMA = { type: "object", properties: {}, additionalProperties: false };

function matchesStaticToken(provided: string): boolean {
  const expected = process.env.MCP_TOKEN;
  if (!expected || !provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Prüft OAuth-Bearer-JWT (bevorzugt) oder das statische MCP_TOKEN (Fallback,
// auch via ?token= für einfache Tests). Gibt true bei gültigem Zugriff.
async function authorized(req: NextRequest): Promise<boolean> {
  const authz = req.headers.get("authorization");
  const bearer = authz?.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
  const queryToken = req.nextUrl.searchParams.get("token") ?? "";

  // 1) OAuth-Zugriffstoken (JWT) validieren.
  if (bearer) {
    const payload = await verifyAccessToken(bearer, resourceUrl(req));
    if (payload) return true;
  }
  // 2) Fallback: statisches MCP_TOKEN (Header oder ?token=).
  return matchesStaticToken(bearer || queryToken);
}

// 401 mit WWW-Authenticate + resource_metadata (RFC 9728), damit claude.ai den
// OAuth-Flow automatisch startet.
function unauthorized(req: NextRequest) {
  const challenge = `Bearer resource_metadata="${baseUrl(req)}/.well-known/oauth-protected-resource"`;
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "unauthorized" } },
    { status: 401, headers: { "WWW-Authenticate": challenge } },
  );
}

function rpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}
function rpcError(id: unknown, code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return unauthorized(req);
  }

  let msg: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    msg = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error", 400);
  }
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: (params?.protocolVersion as string) || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "gollenstede-liquiditaet", version: "1.0.0" },
        instructions: "Liefert ausschließlich aggregierte, anonymisierte Liquiditätskennzahlen (keine Namen/IBANs/Einzelbuchungen).",
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      // Benachrichtigung ohne Antwort.
      return new NextResponse(null, { status: 202 });

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: EMPTY_SCHEMA })),
      });

    case "tools/call": {
      const name = params?.name as string;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Unbekanntes Tool: ${name}`);
      try {
        const data = await tool.fn();
        return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
      } catch (err) {
        return rpcResult(id, {
          content: [{ type: "text", text: `Fehler: ${(err as Error).message}` }],
          isError: true,
        });
      }
    }

    default:
      return rpcError(id, -32601, `Methode nicht unterstützt: ${method}`);
  }
}

// Manche Clients öffnen einen GET-SSE-Stream; dieser Server ist zustandslos und
// braucht keinen server-initiierten Kanal -> 405 (laut MCP-Spec zulässig).
export function GET() {
  return new NextResponse("Method Not Allowed", { status: 405 });
}
