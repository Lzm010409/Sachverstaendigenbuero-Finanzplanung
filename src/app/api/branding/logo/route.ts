import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Liefert das hinterlegte Firmenlogo aus den Einstellungen (als Data-URL
// gespeichert) als echte Bilddatei aus – so bleibt das HTML schlank und das
// Bild ist cachefähig (Cache-Buster über ?v= aus logoUpdatedAt).
export async function GET() {
  const dataUrl = await getSetting("branding.logo");
  const m = dataUrl ? /^data:([^;]+);base64,(.*)$/s.exec(dataUrl) : null;
  if (!m) return new Response("Not found", { status: 404 });
  const [, mime, b64] = m;
  const bytes = Buffer.from(b64, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=300",
      "Content-Length": String(bytes.length),
    },
  });
}
