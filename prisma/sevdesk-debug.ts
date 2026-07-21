// Verifikations-Lauf: prüft mit ECHTEN sevDesk-Daten, ob nach dem Fix noch
// fälschlich "offene"/überfällige Belege auftauchen. Loggt KEINE Namen.
// Läuft nur, wenn SEVDESK_DEBUG=true. Danach wieder entfernen.

import { fetchOpenInvoices, fetchOpenVouchers } from "../src/lib/sevdesk";

const BASE = "https://my.sevdesk.de/api/v1";

async function get(path: string, token: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: token, Accept: "application/json" },
  });
  if (!res.ok) {
    console.log(`[sevdesk-debug] ${path} -> HTTP ${res.status}`);
    return [];
  }
  const data = (await res.json()) as { objects?: Record<string, unknown>[] };
  return Array.isArray(data.objects) ? data.objects : [];
}

function cents(v: unknown): number {
  const n = Number(String(v ?? "0").replace(",", "."));
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) : 0;
}

// Zählt, wie viele bezahlte (Status 1000) Belege einen Rundungs-Restbetreag zeigen.
function scanPaidWithRemainder(objs: Record<string, unknown>[], label: string) {
  let paid = 0;
  let paidWithRemainder = 0;
  let withDeadline = 0;
  for (const o of objs) {
    if (Number(o.status ?? 0) < 1000) continue;
    paid++;
    const rem = cents(o.sumGross) - Math.min(cents(o.paidAmount), cents(o.sumGross));
    if (rem > 0) paidWithRemainder++;
    if (o.paymentDeadline) withDeadline++;
  }
  console.log(
    `[sevdesk-debug] ${label}: bezahlt(Status1000)=${paid}, davon mit Restbetrag>0=${paidWithRemainder}, mit paymentDeadline=${withDeadline}`,
  );
}

async function main() {
  const token = process.env.SEVDESK_API_TOKEN;
  if (!token) {
    console.log("[sevdesk-debug] kein SEVDESK_API_TOKEN");
    return;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Rohdaten scannen: gibt es bezahlte Belege mit 0,01-Restbetrag? (=alte Bug-Ursache)
  const rawInv = await get("/Invoice?limit=1000", token);
  const rawVou = await get("/Voucher?limit=1000", token);
  scanPaidWithRemainder(rawInv, "Invoices");
  scanPaidWithRemainder(rawVou, "Vouchers");

  // Fix verifizieren: die realen Mapping-Funktionen laufen lassen.
  const receivables = await fetchOpenInvoices(token);
  const payables = await fetchOpenVouchers(token);

  const overdueR = receivables.filter((i) => i.dueDate < today);
  const overdueP = payables.filter((i) => i.dueDate < today);
  console.log(
    `[sevdesk-debug] Offene Forderungen=${receivables.length} (überfällig=${overdueR.length}), ` +
      `Offene Verbindlichkeiten=${payables.length} (überfällig=${overdueP.length})`,
  );

  // Stichprobe: keiner der als offen ausgewiesenen Posten darf ein winziger
  // Restbetrag (<= 2 Cent) sein.
  const tinyR = receivables.filter((i) => i.amountCents - i.paidAmountCents <= 2);
  const tinyP = payables.filter((i) => i.amountCents - i.paidAmountCents <= 2);
  console.log(
    `[sevdesk-debug] Mini-Restbeträge (<=2ct) faelschlich offen: Forderungen=${tinyR.length}, Verbindlichkeiten=${tinyP.length}`,
  );

  for (const i of overdueP.slice(0, 5)) {
    console.log(
      `[sevdesk-debug] überfällige Verbindlichkeit: due=${i.dueDate.toISOString().slice(0, 10)} ` +
        `offen=${((i.amountCents - i.paidAmountCents) / 100).toFixed(2)} ref=${i.reference ?? "-"}`,
    );
  }
  console.log("[sevdesk-debug] fertig.");
}

main().catch((e) => console.log("[sevdesk-debug] Fehler:", (e as Error).message));
