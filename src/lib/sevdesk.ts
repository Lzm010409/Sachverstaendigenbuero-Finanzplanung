import { startOfDayUTC } from "./dates";

// Client für die sevDesk-API v1. Wir lesen Bankkonten (CheckAccount) und deren
// Umsätze (CheckAccountTransaction). Auth-Header: `Authorization: <token>`.

const BASE = "https://my.sevdesk.de/api/v1";

export interface SevdeskAccount {
  id: string;
  name: string;
  type: string | null;
  currency: string | null;
  iban: string | null;
  balance: number | null; // aktueller Kontostand laut sevDesk (falls im Objekt enthalten)
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export interface MappedTransaction {
  externalId: string;
  date: Date;
  amountCents: number;
  counterparty: string;
  purpose: string;
}

interface RawSevObject {
  [k: string]: unknown;
}

async function sevGet(path: string, token: string): Promise<RawSevObject[]> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: token, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`sevDesk ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { objects?: RawSevObject[] };
  return Array.isArray(data.objects) ? data.objects : [];
}

export async function fetchCheckAccounts(token: string): Promise<SevdeskAccount[]> {
  const objs = await sevGet(`/CheckAccount?limit=1000`, token);
  return objs.map((o) => ({
    id: String(o.id),
    name: String(o.name ?? "sevDesk-Konto"),
    type: o.type != null ? String(o.type) : null,
    currency: o.currency != null ? String(o.currency) : null,
    iban: o.iban != null ? String(o.iban) : null,
    balance: toNumberOrNull(o.balance),
  }));
}

/**
 * Aktuellen Kontostand aus sevDesk holen (getBalanceAtDate, Stichtag heute).
 * Liefert Cent oder null. Robust gegenüber Zahl/String/verschachtelter Antwort.
 */
export async function fetchAccountBalanceCents(
  token: string,
  accountId: string,
  atUnixSeconds: number,
): Promise<number | null> {
  try {
    const res = await fetch(
      `${BASE}/CheckAccount/${encodeURIComponent(accountId)}/getBalanceAtDate?date=${atUnixSeconds}`,
      { headers: { Authorization: token, Accept: "application/json" }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { objects?: unknown };
    const o = data.objects;
    const num =
      typeof o === "object" && o !== null
        ? toNumberOrNull((o as Record<string, unknown>).balance ?? (o as Record<string, unknown>).value)
        : toNumberOrNull(o);
    return num == null ? null : Math.round(num * 100);
  } catch {
    return null;
  }
}

/** Wandelt einen rohen sevDesk-Umsatz in unser Zwischenformat (oder null). */
export function mapTransaction(o: RawSevObject): MappedTransaction | null {
  const id = o.id != null ? String(o.id) : "";
  if (!id) return null;
  const amountRaw = o.amount != null ? String(o.amount) : "";
  const amount = Number(amountRaw.replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  const dateStr = String(o.valueDate ?? o.entryDate ?? "");
  // Kalenderdatum direkt aus dem ISO-String übernehmen, damit ein
  // Zeitzonen-Offset (z.B. +02:00) das Datum nicht auf den Vortag verschiebt.
  let date: Date;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (ymd) {
    date = startOfDayUTC(new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))));
  } else {
    const parsed = dateStr ? new Date(dateStr) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return null;
    date = startOfDayUTC(parsed);
  }
  return {
    externalId: id,
    date,
    amountCents: Math.round(amount * 100),
    counterparty: String(o.payeePayerName ?? "").trim(),
    purpose: String(o.paymtPurpose ?? o.paymentPurpose ?? "").trim(),
  };
}

export interface SevdeskOpenItem {
  externalId: string;
  source: string;
  kind: "RECEIVABLE" | "PAYABLE";
  counterparty: string;
  reference: string | null;
  amountCents: number; // Bruttobetrag, positiv
  paidAmountCents: number; // bereits bezahlter Anteil
  dueDate: Date;
}

// Restbetrag bis zu dem ein Beleg als "abgeschlossen" gilt. sevDesk rundet
// intern teils auf den Cent, sodass vollständig bezahlte Belege einen Rest von
// 0,01 € zeigen können – dieser darf nicht als offener Posten auftauchen.
const SETTLED_TOLERANCE_CENTS = 2;

// Status 1000 = von sevDesk als vollständig bezahlt markiert (sowohl Rechnung
// als auch Beleg). Solche Belege sind nie offen.
const STATUS_PAID = 1000;

// Bereits bezahlter Anteil eines Belegs/Rechnung. sevDesk liefert dies in
// `paidAmount` (ggf. auch sumGrossPaid/sumPaid).
function paidCents(o: RawSevObject, gross: number): number {
  const paid = toNumberOrNull(o.paidAmount ?? o.sumGrossPaid ?? o.sumPaid);
  if (paid == null) return 0;
  return Math.min(Math.round(Math.abs(paid) * 100), Math.round(Math.abs(gross) * 100));
}

function firstStr(o: RawSevObject, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "object" && v !== null) {
      const nm = (v as RawSevObject).name;
      if (typeof nm === "string" && nm.trim()) return nm.trim();
    }
  }
  return "";
}

function firstDate(o: RawSevObject, keys: string[]): Date | null {
  for (const k of keys) {
    const s = o[k] != null ? String(o[k]) : "";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return startOfDayUTC(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
  }
  return null;
}

// Rechnungen (Ausgangsrechnungen) -> offene Forderungen (nur unbezahlte).
export async function fetchOpenInvoices(token: string): Promise<SevdeskOpenItem[]> {
  const objs = await sevGet(`/Invoice?limit=1000&embed=contact`, token);
  const out: SevdeskOpenItem[] = [];
  for (const o of objs) {
    const status = Number(o.status ?? 0);
    if (status < 200) continue; // Entwürfe überspringen
    if (status >= STATUS_PAID) continue; // von sevDesk als bezahlt markiert
    const amount = toNumberOrNull(o.sumGross ?? o.sumgross);
    if (amount == null || amount === 0) continue;
    const grossCents = Math.round(Math.abs(amount) * 100);
    const paid = paidCents(o, amount);
    if (grossCents - paid <= SETTLED_TOLERANCE_CENTS) continue; // (nahezu) vollständig bezahlt
    const date = firstDate(o, ["invoiceDate", "deliveryDate", "createDate"]) ?? startOfDayUTC(new Date());
    // Fälligkeit = Rechnungsdatum + Zahlungsziel (timeToPay). `payDate` ist das
    // tatsächliche Zahldatum (bei offenen Rechnungen null) – nicht die Fälligkeit.
    const timeToPay = Number(o.timeToPay ?? 0);
    const due = addDaysLocal(date, Number.isFinite(timeToPay) ? timeToPay : 0);
    out.push({
      externalId: String(o.id),
      source: "sevdesk-invoice",
      kind: "RECEIVABLE",
      counterparty: firstStr(o, ["contact", "contactName", "header"]) || "Rechnung",
      reference: firstStr(o, ["invoiceNumber", "header"]) || null,
      amountCents: grossCents,
      paidAmountCents: paid,
      dueDate: due,
    });
  }
  return out;
}

// Belege (Eingangsrechnungen/Ausgaben) -> offene Verbindlichkeiten (unbezahlt).
export async function fetchOpenVouchers(token: string): Promise<SevdeskOpenItem[]> {
  const objs = await sevGet(`/Voucher?limit=1000&embed=supplier`, token);
  const out: SevdeskOpenItem[] = [];
  for (const o of objs) {
    const status = Number(o.status ?? 0);
    if (status < 100) continue; // Entwürfe überspringen
    if (status >= STATUS_PAID) continue; // von sevDesk als bezahlt markiert
    const amount = toNumberOrNull(o.sumGross ?? o.sumgross);
    if (amount == null || amount === 0) continue;
    const grossCents = Math.round(Math.abs(amount) * 100);
    const paid = paidCents(o, amount);
    if (grossCents - paid <= SETTLED_TOLERANCE_CENTS) continue; // (nahezu) vollständig bezahlt
    const isIncome = String(o.creditDebit ?? "D").toUpperCase() === "C";
    const date = firstDate(o, ["voucherDate", "createDate"]) ?? startOfDayUTC(new Date());
    // Fälligkeit = paymentDeadline (Zahlungsziel des Belegs). `payDate` ist das
    // tatsächliche Zahldatum – für offene Belege irreführend.
    const due = firstDate(o, ["paymentDeadline"]) ?? date;
    out.push({
      externalId: String(o.id),
      source: "sevdesk-voucher",
      kind: isIncome ? "RECEIVABLE" : "PAYABLE",
      counterparty: firstStr(o, ["supplier", "supplierName", "description", "creditDebit"]) || "Beleg",
      reference: firstStr(o, ["voucherNumber", "description"]) || null,
      amountCents: grossCents,
      paidAmountCents: paid,
      dueDate: due,
    });
  }
  return out;
}

function addDaysLocal(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + (Number.isFinite(days) ? days : 0));
  return startOfDayUTC(r);
}

/** Lädt alle Umsätze eines Kontos (paginiert). */
export async function fetchTransactions(
  token: string,
  accountId: string,
): Promise<MappedTransaction[]> {
  const out: MappedTransaction[] = [];
  const limit = 1000;
  for (let offset = 0; offset < 100_000; offset += limit) {
    const path =
      `/CheckAccountTransaction?checkAccount[id]=${encodeURIComponent(accountId)}` +
      `&checkAccount[objectName]=CheckAccount&limit=${limit}&offset=${offset}`;
    const objs = await sevGet(path, token);
    for (const o of objs) {
      const m = mapTransaction(o);
      if (m) out.push(m);
    }
    if (objs.length < limit) break;
  }
  return out;
}
