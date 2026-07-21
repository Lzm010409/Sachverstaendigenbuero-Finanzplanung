// Verifikations-Lauf: prüft mit ECHTEN sevDesk-Daten, ob nach dem Fix noch
// fälschlich "offene"/überfällige Belege auftauchen. Loggt KEINE Namen.
// Läuft nur, wenn SEVDESK_DEBUG=true. Danach wieder entfernen.
//
// Die Filter-/Fälligkeitslogik ist hier bewusst identisch zu
// src/lib/sevdesk.ts (fetchOpenInvoices/fetchOpenVouchers) nachgebildet, da der
// Standalone-Container src/ nicht enthält. Das echte Verhalten ist zusätzlich
// über Unit-Tests (src/lib/__tests__/sevdesk.test.ts) abgesichert.

const BASE = "https://my.sevdesk.de/api/v1";
const SETTLED_TOLERANCE_CENTS = 2;
const STATUS_PAID = 1000;

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

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function cents(v: unknown): number {
  const n = num(v);
  return n == null ? 0 : Math.round(Math.abs(n) * 100);
}
function paidCents(o: Record<string, unknown>, grossCents: number): number {
  const p = num(o.paidAmount ?? o.sumGrossPaid ?? o.sumPaid);
  if (p == null) return 0;
  return Math.min(Math.round(Math.abs(p) * 100), grossCents);
}
function ymd(v: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ""));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + (Number.isFinite(days) ? days : 0)));
  return dt.toISOString().slice(0, 10);
}

interface Open { externalId: string; due: string; openCents: number; ref: string | null }

function mapInvoices(objs: Record<string, unknown>[]): Open[] {
  const out: Open[] = [];
  for (const o of objs) {
    const status = Number(o.status ?? 0);
    if (status < 200 || status >= STATUS_PAID) continue;
    const grossCents = cents(o.sumGross ?? o.sumgross);
    if (grossCents === 0) continue;
    const paid = paidCents(o, grossCents);
    if (grossCents - paid <= SETTLED_TOLERANCE_CENTS) continue;
    const date = ymd(o.invoiceDate) ?? ymd(o.deliveryDate) ?? ymd(o.createDate) ?? "2000-01-01";
    const due = addDays(date, Number(o.timeToPay ?? 0));
    out.push({ externalId: String(o.id), due, openCents: grossCents - paid, ref: (o.invoiceNumber as string) ?? null });
  }
  return out;
}
function mapVouchers(objs: Record<string, unknown>[]): Open[] {
  const out: Open[] = [];
  for (const o of objs) {
    const status = Number(o.status ?? 0);
    if (status < 100 || status >= STATUS_PAID) continue;
    const grossCents = cents(o.sumGross ?? o.sumgross);
    if (grossCents === 0) continue;
    const paid = paidCents(o, grossCents);
    if (grossCents - paid <= SETTLED_TOLERANCE_CENTS) continue;
    const due = ymd(o.paymentDeadline) ?? ymd(o.voucherDate) ?? ymd(o.createDate) ?? "2000-01-01";
    out.push({ externalId: String(o.id), due, openCents: grossCents - paid, ref: (o.description as string) ?? null });
  }
  return out;
}

function scanPaidRemainder(objs: Record<string, unknown>[], label: string) {
  let paid = 0, withRemainder = 0, withDeadline = 0;
  for (const o of objs) {
    if (Number(o.status ?? 0) < STATUS_PAID) continue;
    paid++;
    const g = cents(o.sumGross);
    if (g - Math.min(cents(o.paidAmount), g) > 0) withRemainder++;
    if (o.paymentDeadline) withDeadline++;
  }
  console.log(`[sevdesk-debug] ${label}: Status1000=${paid}, mit Restbetrag>0=${withRemainder}, mit paymentDeadline=${withDeadline}`);
}

async function main() {
  const token = process.env.SEVDESK_API_TOKEN;
  if (!token) { console.log("[sevdesk-debug] kein SEVDESK_API_TOKEN"); return; }
  const today = new Date().toISOString().slice(0, 10);

  const rawInv = await get("/Invoice?limit=1000", token);
  const rawVou = await get("/Voucher?limit=1000", token);
  console.log(`[sevdesk-debug] Rohdaten: Invoices=${rawInv.length}, Vouchers=${rawVou.length}`);
  scanPaidRemainder(rawInv, "Invoices");
  scanPaidRemainder(rawVou, "Vouchers");

  const recv = mapInvoices(rawInv);
  const pay = mapVouchers(rawVou);
  const overdueR = recv.filter((i) => i.due < today);
  const overdueP = pay.filter((i) => i.due < today);
  console.log(`[sevdesk-debug] Offene Forderungen=${recv.length} (überfällig=${overdueR.length}), Offene Verbindlichkeiten=${pay.length} (überfällig=${overdueP.length})`);

  const tiny = [...recv, ...pay].filter((i) => i.openCents <= SETTLED_TOLERANCE_CENTS);
  console.log(`[sevdesk-debug] fälschlich offene Mini-Restbeträge (<=2ct): ${tiny.length}`);

  for (const i of overdueP.slice(0, 6)) {
    console.log(`[sevdesk-debug] überfällige Verbindlichkeit: due=${i.due} offen=${(i.openCents / 100).toFixed(2)}`);
  }
  console.log("[sevdesk-debug] fertig.");
}

main().catch((e) => console.log("[sevdesk-debug] Fehler:", (e as Error).message));
