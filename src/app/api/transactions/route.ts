import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Leichtgewichtige Mutationen für die Umsätze-Tabelle. Bewusst als API-Route
// (fetch) statt Server-Action: eine Server-Action löst nach jeder Ausführung ein
// erneutes Rendern der aktuellen (schweren) Route aus – bei schnellem
// Kategorisieren führt das zu einem Refresh-Sturm und 503-Fehlern. Über fetch
// wird nur die DB aktualisiert; die Tabelle zeigt die Änderung optimistisch an.
export async function POST(req: Request) {
  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const op = (body as { op?: string }).op;

  if (op === "categorize") {
    const raw = (body as { ids?: unknown }).ids;
    const ids = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
    const categoryId = (body as { categoryId?: string | null }).categoryId || null;
    if (ids.length === 0) return NextResponse.json({ updated: 0 });
    const res = await prisma.transaction.updateMany({
      where: { id: { in: ids } },
      data: { categoryId },
    });
    return NextResponse.json({ updated: res.count });
  }

  if (op === "delete") {
    const id = String((body as { id?: unknown }).id ?? "");
    if (!id) return NextResponse.json({ error: "no id" }, { status: 400 });
    await prisma.transaction.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
