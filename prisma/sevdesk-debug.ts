// Diagnose: ruft echte sevDesk-Rechnungen/Belege ab und loggt die für das
// Mapping relevanten Felder (Status, Beträge, Datumsangaben) – OHNE Namen.
// Läuft nur, wenn SEVDESK_DEBUG=true. Danach wieder entfernen.

const BASE = "https://my.sevdesk.de/api/v1";

async function get(path: string, token: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: token, Accept: "application/json" },
  });
  if (!res.ok) {
    console.log(`[sevdesk-debug] ${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return [];
  }
  const data = (await res.json()) as { objects?: Record<string, unknown>[] };
  return Array.isArray(data.objects) ? data.objects : [];
}

function pick(o: Record<string, unknown>, keys: string[]) {
  const r: Record<string, unknown> = {};
  for (const k of keys) if (k in o) r[k] = o[k];
  return r;
}

async function main() {
  const token = process.env.SEVDESK_API_TOKEN;
  if (!token) {
    console.log("[sevdesk-debug] kein SEVDESK_API_TOKEN");
    return;
  }

  const invoices = await get("/Invoice?limit=15", token);
  console.log(`[sevdesk-debug] Invoices: ${invoices.length}`);
  if (invoices[0]) console.log("[sevdesk-debug] Invoice-KEYS:", Object.keys(invoices[0]).join(","));
  const invStatus: Record<string, number> = {};
  for (const o of invoices) {
    const s = String(o.status);
    invStatus[s] = (invStatus[s] ?? 0) + 1;
  }
  console.log("[sevdesk-debug] Invoice-Status-Verteilung:", JSON.stringify(invStatus));
  for (const o of invoices.slice(0, 6)) {
    console.log(
      "[sevdesk-debug] INV",
      JSON.stringify(
        pick(o, [
          "id", "status", "invoiceDate", "timeToPay", "payDate", "dueDate",
          "sumGross", "paidAmount", "sumGrossPaid", "sumPaid", "paidPartially", "isPaid",
        ]),
      ),
    );
  }

  const vouchers = await get("/Voucher?limit=15", token);
  console.log(`[sevdesk-debug] Vouchers: ${vouchers.length}`);
  if (vouchers[0]) console.log("[sevdesk-debug] Voucher-KEYS:", Object.keys(vouchers[0]).join(","));
  const vStatus: Record<string, number> = {};
  for (const o of vouchers) {
    const s = String(o.status);
    vStatus[s] = (vStatus[s] ?? 0) + 1;
  }
  console.log("[sevdesk-debug] Voucher-Status-Verteilung:", JSON.stringify(vStatus));
  for (const o of vouchers.slice(0, 6)) {
    console.log(
      "[sevdesk-debug] VOU",
      JSON.stringify(
        pick(o, [
          "id", "status", "voucherDate", "payDate", "dueDate", "deliveryDate",
          "sumGross", "paidAmount", "sumGrossPaid", "creditDebit", "paidPartially",
        ]),
      ),
    );
  }
  console.log("[sevdesk-debug] fertig.");
}

main().catch((e) => console.log("[sevdesk-debug] Fehler:", (e as Error).message));
